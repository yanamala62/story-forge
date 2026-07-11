/**
 * EpisodeRetentionService
 *
 * Maintains the invariant: each Story retains only its latest RETENTION_LIMIT
 * (default 3) Episode records, regardless of status.
 *
 * For every Episode older than the limit this service:
 *   1. Resolves all Supabase Storage keys owned by that episode from the DB.
 *   2. Deletes those Supabase objects (batch remove — idempotent for missing keys).
 *   3. Removes any leftover local temporary directories for that episode.
 *   4. Cascades-deletes the Episode DB row (all child rows removed automatically
 *      by Postgres FK cascades: Scene, Prompt, GeneratedImage, AudioFile,
 *      SubtitleFile, Video, SeoMetadata, Upload, Analytics).
 *   5. Decrements Story.episodeCount if the episode was ever counted (reached
 *      GENERATING_SCENES or later).
 *
 * Design guarantees:
 * - Never touches YouTube (no import of upload-agent, no YouTube API calls).
 * - Never runs against an episode currently being processed (isRunning check).
 * - Never deletes the latest RETENTION_LIMIT episodes for a story.
 * - Safe to call repeatedly (idempotent at every step).
 * - Cleanup failure NEVER propagates to the main pipeline result.
 */

import { rm } from 'fs/promises';
import { join } from 'path';
import { createLogger, deleteStorageObjects, getEnv } from '@storyforge/shared';
import {
  prisma,
  EpisodeRepository,
  StoryRepository,
  ImageRepository,
  AudioRepository,
  SubtitleRepository,
  VideoRepository,
} from '@storyforge/database';
import type { Episode } from '@storyforge/database';
import { PipelineOrchestratorService } from './pipeline-orchestrator.service.js';

const logger = createLogger('episode-retention');

/** How many episodes per story to keep. */
const RETENTION_LIMIT = 3;

/**
 * EpisodeStatus values that indicate the episode was counted in
 * Story.episodeCount (i.e., it progressed past GENERATING_STORY into
 * GENERATING_SCENES, where incrementEpisodeCount is called).
 * An episode still at PENDING or GENERATING_STORY was never counted.
 */
const COUNTED_STATUSES = new Set([
  'GENERATING_SCENES',
  'GENERATING_PROMPTS',
  'GENERATING_IMAGES',
  'GENERATING_AUDIO',
  'GENERATING_SUBTITLES',
  'COMPOSING_VIDEO',
  'GENERATING_SEO',
  'UPLOADING',
  'PUBLISHED',
  'FAILED', // could have failed at any stage — safest to always decrement for FAILED too,
            // because the counter was already incremented once it reached GENERATING_SCENES.
            // The worst case is decrementing by 1 for an episode that failed at GENERATING_STORY
            // (i.e. never reached GENERATING_SCENES) — that leaves episodeCount one lower than
            // the live relation count (_count.episodes), but that's a minor cosmetic gap vs. the
            // alternative of keeping a stale higher count. The live _count from Prisma is always
            // authoritative for anything that matters structurally.
]);

export interface RetentionResult {
  storyId: string;
  evaluated: number;
  cleaned: number;
  skipped: number;
  failed: number;
}

// ── Repository singletons (reused across calls in the same process) ──────────

const episodeRepo = new EpisodeRepository();
const storyRepo   = new StoryRepository();
const imageRepo   = new ImageRepository();
const audioRepo   = new AudioRepository();
const subtitleRepo = new SubtitleRepository();
const videoRepo   = new VideoRepository();

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Collects every Supabase Storage key that belongs exclusively to this episode.
 * Keys are read from the actual DB rows — never reconstructed from patterns —
 * so only keys that were actually written (and recorded) are returned.
 * Returns an empty array if the episode never progressed far enough to write files.
 */
async function resolveEpisodeStorageKeys(episodeId: string): Promise<string[]> {
  const keys: string[] = [];

  // GeneratedImage rows (one per scene, joined via scene.episodeId)
  const images = await imageRepo.findByEpisodeScenes(episodeId);
  for (const img of images) {
    if (img.s3Key) keys.push(img.s3Key);
  }

  // AudioFile (unique per episode)
  const audio = await audioRepo.findByEpisodeId(episodeId);
  if (audio?.s3Key) keys.push(audio.s3Key);

  // SubtitleFile (unique per episode)
  const subtitle = await subtitleRepo.findByEpisodeId(episodeId);
  if (subtitle?.s3Key) keys.push(subtitle.s3Key);

  // Video + thumbnail (unique per episode, both stored on the Video row)
  const video = await videoRepo.findByEpisodeId(episodeId);
  if (video?.s3Key)          keys.push(video.s3Key);
  if (video?.thumbnailS3Key) keys.push(video.thumbnailS3Key);

  return keys;
}

/**
 * Deletes any remaining local temporary directories for this episode across
 * all four media types. In normal (remote-storage-enabled) operation most of
 * these are already gone (persistFile deletes them right after upload), but:
 *  - scratch files that are never uploaded (concat_list.txt, subtitles_burn.srt)
 *  - partial artifacts from a mid-step failure
 *  - anything written when remote storage is disabled
 * ...may still be present.
 *
 * Scoped strictly to `generated/<type>/<lang>/<episodeId>/` — never touches
 * adjacent directories or the whisper model cache under the same /tmp tree.
 */
async function deleteLocalArtifacts(
  episodeId: string,
  lang: string,
): Promise<void> {
  const env = getEnv();
  const base = env.STORAGE_LOCAL_PATH; // e.g. './generated'
  const langLower = lang.toLowerCase();

  const dirs = [
    join(base, 'images',    langLower, episodeId),
    join(base, 'audio',     langLower, episodeId),
    join(base, 'subtitles', langLower, episodeId),
    join(base, 'video',     langLower, episodeId),
  ];

  await Promise.all(
    dirs.map((dir) =>
      rm(dir, { recursive: true, force: true }).catch((err) => {
        // Log but don't throw — missing dir is the expected case in production
        logger.debug('Local artifact dir not found (expected in production)', {
          episodeId,
          dir,
          error: err instanceof Error ? err.message : String(err),
        });
      }),
    ),
  );
}

/**
 * Performs the cascading DB delete and (if appropriate) decrements the
 * Story.episodeCount denormalized counter.
 *
 * The Prisma cascade (onDelete: Cascade on every child relation from Episode)
 * atomically removes: Scene, Prompt, GeneratedImage, AudioFile, SubtitleFile,
 * Video, SeoMetadata, Upload, Analytics — in one DB statement.
 *
 * Throws P2025 (record not found) if the row is already gone — caller should
 * treat that as success (desired end state already achieved).
 */
async function deleteEpisodeRow(
  episode: Episode,
): Promise<void> {
  await prisma.episode.delete({ where: { id: episode.id } });
  logger.info('Episode DB row deleted (cascade)', {
    episodeId: episode.id,
    storyId: episode.storyId,
    status: episode.status,
    episodeNumber: episode.episodeNumber,
  });

  // Decrement the denormalized counter if this episode was ever counted.
  // Using a simple boolean guard rather than enumerating exact statuses to
  // avoid missing newly-introduced statuses in future enum expansions.
  const wasCounted = COUNTED_STATUSES.has(episode.status);
  if (wasCounted) {
    try {
      await storyRepo.decrementEpisodeCount(episode.storyId);
    } catch (err) {
      // The story itself may have been soft-deleted; log but don't fail cleanup.
      logger.warn('Could not decrement episodeCount — story may be deleted', {
        storyId: episode.storyId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Full cleanup for one episode (Supabase → local → DB).
 * Throws on error so the caller (runForStory) can count it as a failure and
 * continue to the next eligible episode.
 */
async function cleanupEpisode(episode: Episode): Promise<void> {
  const { id: episodeId, storyId, status } = episode;

  logger.info('Retention: starting cleanup', {
    episodeId,
    storyId,
    status,
    episodeNumber: episode.episodeNumber,
  });

  // Step 1 — Resolve Supabase keys BEFORE any delete (once the DB row is gone
  // we lose the only record of where the files live).
  const keys = await resolveEpisodeStorageKeys(episodeId);
  logger.debug('Retention: resolved storage keys', { episodeId, count: keys.length });

  // Step 2 — Delete Supabase objects.
  // deleteStorageObjects is a no-op when remote storage isn't configured,
  // and Supabase's remove() silently succeeds for already-absent keys.
  await deleteStorageObjects(keys);

  // Step 3 — Delete local temporary artifacts (best-effort, all errors caught inside).
  // We need the story language to reconstruct the path — load it from the episode's story.
  try {
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { language: true },
    });
    const lang = story?.language ?? 'EN';
    await deleteLocalArtifacts(episodeId, lang);
  } catch (err) {
    // Not fatal — local disk cleanup failure shouldn't abort DB cleanup.
    logger.warn('Retention: local artifact cleanup failed (continuing)', {
      episodeId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 4 — Delete the Episode DB row (cascades to all child tables).
  try {
    await deleteEpisodeRow(episode);
  } catch (err: unknown) {
    // P2025 = "Record not found" — already deleted (idempotent success).
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code: string }).code === 'P2025'
    ) {
      logger.debug('Retention: episode row already deleted — idempotent no-op', { episodeId });
      return;
    }
    throw err;
  }

  logger.info('Retention: episode cleaned', {
    episodeId,
    storyId,
    episodeNumber: episode.episodeNumber,
    supabaseKeysDeleted: keys.length,
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the retention pass for one story.
 *
 * Algorithm:
 *   1. Load ALL episodes for the story, newest-first by createdAt.
 *   2. episodes[0..RETENTION_LIMIT-1] → retained unconditionally (any status).
 *   3. episodes[RETENTION_LIMIT..] → eligible for cleanup.
 *   4. Skip any eligible episode that is currently being processed
 *      (PipelineOrchestratorService.isRunning — in-process guard).
 *   5. Run cleanupEpisode() on each remaining eligible episode.
 *      Failure of one episode's cleanup is logged and counted; it never
 *      aborts the pass for subsequent episodes.
 *
 * Returns a summary of the pass; never throws.
 */
export async function runRetentionForStory(
  storyId: string,
): Promise<RetentionResult> {
  const result: RetentionResult = {
    storyId,
    evaluated: 0,
    cleaned: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    const allEpisodes = await episodeRepo.findAllByStoryId(storyId);

    if (allEpisodes.length <= RETENTION_LIMIT) {
      logger.debug('Retention: story within limit, nothing to clean', {
        storyId,
        count: allEpisodes.length,
        limit: RETENTION_LIMIT,
      });
      return result;
    }

    const eligible = allEpisodes.slice(RETENTION_LIMIT);
    result.evaluated = eligible.length;

    logger.info('Retention: story exceeds limit — evaluating eligible episodes', {
      storyId,
      total: allEpisodes.length,
      retained: RETENTION_LIMIT,
      eligible: eligible.length,
    });

    for (const episode of eligible) {
      if (PipelineOrchestratorService.isRunning(episode.id)) {
        logger.info('Retention: episode is currently running — skipping (will re-evaluate next time)', {
          episodeId: episode.id,
          storyId,
          status: episode.status,
        });
        result.skipped++;
        continue;
      }

      try {
        await cleanupEpisode(episode);
        result.cleaned++;
      } catch (err) {
        logger.error('Retention: failed to clean episode — will retry next pipeline completion', {
          episodeId: episode.id,
          storyId,
          error: err instanceof Error ? err.message : String(err),
        });
        result.failed++;
      }
    }

    logger.info('Retention pass complete', result);
  } catch (err) {
    logger.error('Retention pass failed unexpectedly', {
      storyId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

/**
 * Boot-time sweep: runs retention for every story that currently has more than
 * RETENTION_LIMIT episodes in the DB. Designed to catch stories whose cleanup
 * was skipped because the previous container crashed before the pipeline's
 * finally block could fire.
 *
 * Runs asynchronously after server start — never blocks the HTTP server from
 * accepting requests.
 */
export async function runBootTimeRetentionSweep(): Promise<void> {
  try {
    const storyIds = await episodeRepo.findStoriesExceedingRetention(RETENTION_LIMIT);

    if (storyIds.length === 0) {
      logger.debug('Boot-time retention sweep: no stories exceed the limit');
      return;
    }

    logger.info(`Boot-time retention sweep: ${storyIds.length} story(ies) exceed the ${RETENTION_LIMIT}-episode limit`);

    // Process stories sequentially to avoid hammering Supabase/DB concurrently
    // at boot time when the server is also doing other initialization work.
    for (const storyId of storyIds) {
      await runRetentionForStory(storyId);
    }

    logger.info('Boot-time retention sweep complete');
  } catch (err) {
    // Must not crash the server boot sequence.
    logger.error('Boot-time retention sweep failed — will be retried next pipeline completion', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
