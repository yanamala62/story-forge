import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdir, unlink, stat, readFile, writeFile } from 'fs/promises';
import { dirname, relative, sep } from 'path';
import { createLogger } from './logger.js';
import { StorageError } from './errors.js';
import { getEnv } from './config.js';

const logger = createLogger('storage');

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;

  const env = getEnv();
  client = createClient(env.SUPABASE_URL!, env.SUPABASE_SECRET_KEY!);
  return client;
}

export function isRemoteStorageEnabled(): boolean {
  const env = getEnv();
  return (
    env.STORAGE_TYPE === 'supabase' &&
    !!env.SUPABASE_URL &&
    !!env.SUPABASE_SECRET_KEY &&
    !!env.SUPABASE_BUCKET
  );
}

function toStorageKey(localPath: string): string {
  const env = getEnv();
  const rel = relative(env.STORAGE_LOCAL_PATH, localPath);
  return rel.split(sep).join('/');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export interface PersistedFile {
  s3Key: string | null;
  s3Url: string | null;
}

/**
 * Uploads a locally-written file to Supabase Storage and deletes the local copy.
 * No-op (keeps the local file, returns nulls) when remote storage isn't configured.
 */
export async function persistFile(localPath: string, contentType: string): Promise<PersistedFile> {
  if (!isRemoteStorageEnabled()) {
    return { s3Key: null, s3Url: null };
  }

  const env = getEnv();
  const key = toStorageKey(localPath);
  const fileBuffer = await readFile(localPath);

  const { error } = await getClient()
    .storage.from(env.SUPABASE_BUCKET!)
    .upload(key, fileBuffer, { contentType, upsert: true });

  if (error) {
    throw new StorageError(`Supabase Storage upload failed: ${error.message}`);
  }

  await unlink(localPath).catch(() => {});

  const { data } = getClient().storage.from(env.SUPABASE_BUCKET!).getPublicUrl(key);

  logger.info('File persisted to remote storage', { key, url: data.publicUrl });

  return { s3Key: key, s3Url: data.publicUrl };
}

/**
 * Ensures a file exists at `localPath`, downloading it from Supabase Storage if missing.
 * Returns true if a download happened (caller should later call releaseLocalFile).
 */
export async function ensureLocalFile(localPath: string, s3Key: string | null): Promise<boolean> {
  if (await fileExists(localPath)) return false;

  if (!s3Key) {
    throw new StorageError(`File missing locally and no remote copy recorded: ${localPath}`);
  }

  const env = getEnv();
  const { data, error } = await getClient().storage.from(env.SUPABASE_BUCKET!).download(s3Key);

  if (error || !data) {
    throw new StorageError(`Supabase Storage download failed: ${error?.message ?? 'no data'}`);
  }

  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, Buffer.from(await data.arrayBuffer()));

  logger.info('File downloaded from remote storage', { key: s3Key, localPath });
  return true;
}

/**
 * Deletes a locally re-downloaded file, but only if it was actually downloaded
 * by ensureLocalFile — never touches a file that lives on disk permanently.
 */
export async function releaseLocalFile(localPath: string, wasDownloaded: boolean): Promise<void> {
  if (!wasDownloaded || !isRemoteStorageEnabled()) return;
  await unlink(localPath).catch(() => {});
}

/** Confirms the configured bucket is actually reachable — used by the health check. */
export async function checkStorageHealth(): Promise<{ ok: boolean; message?: string }> {
  if (!isRemoteStorageEnabled()) {
    return { ok: false, message: 'Supabase Storage not configured (STORAGE_TYPE != supabase)' };
  }

  const env = getEnv();

  try {
    const { data, error } = await getClient().storage.getBucket(env.SUPABASE_BUCKET!);
    if (error || !data) {
      return { ok: false, message: error?.message ?? `Bucket "${env.SUPABASE_BUCKET}" not found` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
