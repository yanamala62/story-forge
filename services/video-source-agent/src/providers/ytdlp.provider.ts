import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { createLogger, ExternalServiceError } from '@storyforge/shared';

const execFileAsync = promisify(execFile);
const logger = createLogger('ytdlp-provider');

export interface YtDlpVideoInfo {
  videoId: string;
  title: string;
  /** yt-dlp's self-reported duration in seconds — a HINT ONLY, never authoritative for splitting. */
  durationSeconds: number;
}

interface RawYtDlpInfo {
  id: string;
  title?: string;
  fulltitle?: string;
  duration?: number;
}

/**
 * Fallback player clients tried, in order, when YouTube's "Sign in to
 * confirm you're not a bot" check blocks the default client — this is a
 * well-known consequence of requesting from a datacenter/cloud-host IP
 * (Render, AWS, GCP, etc.); a residential IP is not blocked. This is
 * best-effort and NOT guaranteed (YouTube periodically closes these gaps).
 * The AUTHORITATIVE fix is YTDLP_COOKIES_PATH — see isBotCheckError below.
 */
const FALLBACK_PLAYER_CLIENTS = ['android', 'ios', 'tv_embedded'];

function isBotCheckError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('sign in to confirm') || (lower.includes('confirm') && lower.includes('bot'));
}

function buildBotCheckMessage(rawMessage: string): string {
  return (
    `YouTube is blocking this server's IP with "Sign in to confirm you're not a bot" — this happens to ` +
    `datacenter/cloud-host IPs (Render, AWS, GCP, etc.), not a code bug. Fix: export cookies.txt from a browser ` +
    `logged into YouTube and set YTDLP_COOKIES_PATH to its path (e.g. a Render Secret File mounted at ` +
    `/etc/secrets/youtube-cookies.txt). Raw error: ${rawMessage}`
  );
}

function buildCookieArgs(cookiesPath: string | undefined): string[] {
  return cookiesPath ? ['--cookies', cookiesPath] : [];
}

/**
 * Runs one yt-dlp invocation with the given extra args, retrying with
 * alternate player clients ONLY when the failure looks like the bot-check —
 * any other error fails fast (no point retrying a genuinely-unavailable or
 * private video 4 times).
 */
async function runWithPlayerClientFallback<T>(
  run: (extraArgs: string[]) => Promise<T>,
  cookiesPath: string | undefined,
): Promise<T> {
  const cookieArgs = buildCookieArgs(cookiesPath);
  const attempts: string[][] = [
    cookieArgs,
    ...FALLBACK_PLAYER_CLIENTS.map((client) => [...cookieArgs, '--extractor-args', `youtube:player_client=${client}`]),
  ];

  let lastError: unknown;
  for (const extraArgs of attempts) {
    try {
      return await run(extraArgs);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!isBotCheckError(message)) throw error;
      logger.warn('yt-dlp bot-check hit — retrying with a different player client', {
        nextAttempt: attempts.indexOf(extraArgs) + 1,
      });
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ExternalServiceError('yt-dlp', buildBotCheckMessage(message));
}

/**
 * Fetches metadata without downloading. execFile with an argument ARRAY —
 * never a shell string — so `url` (user-supplied) can never be interpreted
 * as shell syntax even though it's passed straight through to a subprocess.
 */
export async function getVideoInfo(binaryPath: string, url: string, cookiesPath?: string): Promise<YtDlpVideoInfo> {
  return runWithPlayerClientFallback(async (extraArgs) => {
    const args = [url, '--dump-single-json', '--no-warnings', '--no-playlist', '--skip-download', ...extraArgs];

    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(binaryPath, args, { timeout: 60_000, maxBuffer: 20 * 1024 * 1024 }));
    } catch (error) {
      throw new ExternalServiceError(
        'yt-dlp',
        `Failed to fetch video metadata: ${error instanceof Error ? error.message : String(error)}`,
        { url },
      );
    }

    let info: RawYtDlpInfo;
    try {
      info = JSON.parse(stdout) as RawYtDlpInfo;
    } catch {
      throw new ExternalServiceError('yt-dlp', 'Could not parse yt-dlp JSON output', { url });
    }

    return {
      videoId: info.id,
      title: info.title ?? info.fulltitle ?? 'Untitled video',
      durationSeconds: typeof info.duration === 'number' ? info.duration : 0,
    };
  }, cookiesPath);
}

/**
 * Downloads the source video to `outputPath`. Bounded to <=1080p to keep
 * download size/time reasonable — Clip Forge re-encodes every part anyway
 * (FIT_WITH_BLURRED_BACKGROUND), so a 4K source buys nothing but slower
 * downloads and more disk usage.
 *
 * No timeout is set on the child process — a multi-hour source video on a
 * slow connection can legitimately take a long time to download, and killing
 * it partway through would corrupt a resumable pipeline run for no benefit.
 */
export async function downloadVideo(
  binaryPath: string,
  url: string,
  outputPath: string,
  cookiesPath?: string,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });

  logger.info('Downloading source video', { outputPath });

  await runWithPlayerClientFallback(async (extraArgs) => {
    const args = [
      url,
      '-o', outputPath,
      '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      ...extraArgs,
    ];

    try {
      await execFileAsync(binaryPath, args, { maxBuffer: 20 * 1024 * 1024 });
    } catch (error) {
      throw new ExternalServiceError(
        'yt-dlp',
        `Failed to download source video: ${error instanceof Error ? error.message : String(error)}`,
        { url },
      );
    }
  }, cookiesPath);

  logger.info('Source video downloaded', { outputPath });
}
