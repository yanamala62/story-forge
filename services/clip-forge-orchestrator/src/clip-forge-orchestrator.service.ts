import { rm } from 'fs/promises';
import { join } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import {
  createLogger,
  getEnv,
  NotFoundError,
  classifyPipelineError,
  persistFile,
  ensureLocalFile,
  releaseLocalFile,
  deleteStorageObjects,
  isRemoteStorageEnabled,
} from '@storyforge/shared';
import {
  ClipForgeProjectRepository,
  ClipForgePartRepository,
  ClipForgeContinuityValidationRepository,
} from '@storyforge/database';
import type { ClipForgeProject, ClipForgePart } from '@storyforge/database';
import { VideoSourceAgentService, validateYouTubeUrl } from '@storyforge/video-source-agent';
import { buildContinuousSplitPlan, validateContinuity } from '@storyforge/clip-continuity-agent';
import { SeoAgentService } from '@storyforge/seo-agent';
import { UploadAgentService } from '@storyforge/upload-agent';
import { renderClipForgePart } from './renderer/clip-renderer.js';

const logger = createLogger('clip-forge-orchestrator');

const projectRepo = new ClipForgeProjectRepository();
const partRepo = new ClipForgePartRepository();
const continuityRepo = new ClipForgeContinuityValidationRepository();
const videoSourceAgent = new VideoSourceAgentService();
const seoAgent = new SeoAgentService();
const uploadAgent = new UploadAgentService();

// In-memory guards — same pattern as PipelineOrchestratorService (apps/api/src/services/pipeline-orchestrator.service.ts).
const runningProjects = new Set<string>();
const cancelledProjects = new Set<string>();

const MAX_RETRIES_PER_STEP = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(stepName: string, projectId: string, fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      const classified = classifyPipelineError(err);
      if (classified.kind === 'FATAL' || attempt >= MAX_RETRIES_PER_STEP) throw err;
      logger.warn('Clip Forge step retrying', { projectId, step: stepName, attempt, kind: classified.kind });
      await sleep(classified.retryAfterMs);
    }
  }
}

/**
 * YouTube quota/rate-limit errors are NOT necessarily classified as
 * classifyPipelineError's RATE_LIMIT bucket (Google returns 403 with a
 * "quotaExceeded" reason, which the generic classifier treats as FATAL) — so
 * Clip Forge does its own keyword-based detection to route these into the
 * resumable WAITING_FOR_YOUTUBE_QUOTA state instead of a hard FAILED.
 */
function isYouTubeQuotaError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes('quota') ||
    message.includes('uploadlimitexceeded') ||
    message.includes('dailylimitexceeded') ||
    message.includes('ratelimitexceeded') ||
    message.includes('rate limit') ||
    message.includes('429')
  );
}

function resolveFfmpegPath(): string {
  const env = getEnv();
  return env.FFMPEG_BINARY_PATH !== 'ffmpeg' ? env.FFMPEG_BINARY_PATH : (ffmpegStatic ?? 'ffmpeg');
}

function getLocalSourcePath(userId: string, projectId: string): string {
  const env = getEnv();
  return join(process.cwd(), env.STORAGE_LOCAL_PATH, 'clip-forge', userId, projectId, 'source', 'original.mp4');
}

function getLocalPartPath(userId: string, projectId: string, partNumber: number): string {
  const env = getEnv();
  const padded = String(partNumber).padStart(3, '0');
  return join(process.cwd(), env.STORAGE_LOCAL_PATH, 'clip-forge', userId, projectId, 'rendered', `part_${padded}.mp4`);
}

function buildDescription(project: ClipForgeProject, part: ClipForgePart): string {
  const totalLabel = String(part.totalParts).padStart(3, '0');
  return `${part.partLabel} of ${totalLabel}.\n\nOriginal video:\n${project.sourceTitle}\n\n#Shorts`;
}

async function safeDelete(path: string): Promise<void> {
  await rm(path, { force: true }).catch((err) => {
    logger.debug('Non-fatal temp file cleanup failure', { path, error: err instanceof Error ? err.message : String(err) });
  });
}

export interface CreateClipForgeProjectInput {
  userId: string;
  youtubeUrl: string;
}

export interface ClipForgeStatusResult {
  project: ClipForgeProject;
  parts: ClipForgePart[];
  isRunning: boolean;
  uploadedCount: number;
  currentPartNumber: number | null;
  latestContinuityValidation: Awaited<ReturnType<typeof continuityRepo.findLatestByProjectId>>;
}

export interface RunResult {
  projectId: string;
  success: boolean;
  finalStatus: string;
}

export const ClipForgeOrchestratorService = {
  isRunning(projectId: string): boolean {
    return runningProjects.has(projectId);
  },

  /** Cooperative pause — takes effect at the next part boundary, matching PipelineOrchestratorService.cancel. */
  cancel(projectId: string): boolean {
    if (!runningProjects.has(projectId)) return false;
    cancelledProjects.add(projectId);
    logger.info('Clip Forge project pause requested', { projectId });
    return true;
  },

  async createProject(input: CreateClipForgeProjectInput): Promise<ClipForgeProject> {
    const { videoId } = validateYouTubeUrl(input.youtubeUrl);

    const project = await projectRepo.create({
      userId: input.userId,
      sourceUrl: input.youtubeUrl,
      sourceVideoId: videoId,
      sourceTitle: '',
      targetShortDuration: getEnv().CLIP_FORGE_TARGET_DURATION_SECONDS,
    });

    logger.info('Clip Forge project created', { projectId: project.id, userId: input.userId, videoId });
    return project;
  },

  startInBackground(projectId: string): void {
    if (runningProjects.has(projectId)) {
      logger.warn('Clip Forge project already running — ignoring duplicate start', { projectId });
      return;
    }
    void ClipForgeOrchestratorService.run(projectId).catch((err) => {
      logger.error('Clip Forge background run crashed unexpectedly', {
        projectId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  },

  /** Resets FAILED parts so the next run() picks them back up. Never touches a part that already has a youtubeVideoId. */
  async retryFailedParts(projectId: string): Promise<void> {
    const failed = await partRepo.findFailed(projectId);
    for (const part of failed) {
      if (part.youtubeVideoId) continue; // unreachable in practice, defended anyway
      await partRepo.updateStatus(part.id, part.renderedStoragePath ? 'STORED' : 'PENDING', { lastUploadError: null });
    }
    logger.info('Reset failed Clip Forge parts for retry', { projectId, count: failed.length });
  },

  async getStatus(projectId: string): Promise<ClipForgeStatusResult> {
    const project = await projectRepo.findById(projectId);
    if (!project) throw new NotFoundError('ClipForgeProject', projectId);

    const parts = await partRepo.findByProjectId(projectId);
    const latestContinuityValidation = await continuityRepo.findLatestByProjectId(projectId);
    const uploadedCount = parts.filter((p) => !!p.youtubeVideoId).length;
    const currentPart = parts.find((p) => !p.youtubeVideoId);

    return {
      project,
      parts,
      isRunning: runningProjects.has(projectId),
      uploadedCount,
      currentPartNumber: currentPart?.partNumber ?? null,
      latestContinuityValidation,
    };
  },

  /**
   * The full sequential, resumable, idempotent Clip Forge pipeline. Safe to
   * call repeatedly — every step checks DB state first and skips what's
   * already done, per the product spec's RESUMABLE PIPELINE requirement.
   */
  async run(projectId: string): Promise<RunResult> {
    if (runningProjects.has(projectId)) {
      logger.warn('Clip Forge project already running — ignoring duplicate run()', { projectId });
      return { projectId, success: false, finalStatus: 'ALREADY_RUNNING' };
    }
    runningProjects.add(projectId);

    const ffmpegPath = resolveFfmpegPath();
    let localSourcePath = '';
    let sourceWasDownloadedThisRun = false;

    try {
      let project = await projectRepo.findById(projectId);
      if (!project) throw new NotFoundError('ClipForgeProject', projectId);

      logger.info('Clip Forge run starting', { projectId, status: project.status });

      // ── STEP 1: source ingest ────────────────────────────────────────────
      if (project.sourceDuration == null) {
        await projectRepo.updateStatus(projectId, 'SOURCE_VALIDATING');
        try {
          const ingested = await withRetry('source-ingest', projectId, () =>
            videoSourceAgent.ingestSource({ youtubeUrl: project!.sourceUrl, userId: project!.userId, projectId }),
          );
          await projectRepo.updateSource(projectId, {
            sourceTitle: ingested.title,
            sourceDuration: ingested.duration,
            sourceWidth: ingested.width,
            sourceHeight: ingested.height,
            sourceFps: ingested.fps,
            sourceHasAudio: ingested.audioDetected,
            sourceStoragePath: ingested.s3Key,
            sourceFingerprint: ingested.fingerprint,
          });
          await projectRepo.updateStatus(projectId, 'SOURCE_READY', { startedAt: project.startedAt ?? new Date() });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await projectRepo.updateStatus(projectId, 'FAILED', { failureReason: message, failedAt: new Date() });
          logger.error('Clip Forge source ingest failed', { projectId, error: message });
          return { projectId, success: false, finalStatus: 'FAILED' };
        }
        project = await projectRepo.findById(projectId);
        if (!project) throw new NotFoundError('ClipForgeProject', projectId);
      }

      // Local source file is needed by every part render for the rest of this
      // run — kept alive for the whole run and released in `finally` below,
      // rather than re-downloading it once per part.
      localSourcePath = getLocalSourcePath(project.userId, project.id);
      if (project.sourceStoragePath) {
        sourceWasDownloadedThisRun = await ensureLocalFile(localSourcePath, project.sourceStoragePath);
      }

      // ── STEP 2: split planning ───────────────────────────────────────────
      let parts = await partRepo.findByProjectId(projectId);
      if (parts.length === 0) {
        await projectRepo.updateStatus(projectId, 'SPLIT_PLANNING');
        const plan = buildContinuousSplitPlan({
          sourceDuration: project.sourceDuration!,
          targetDurationSeconds: project.targetShortDuration,
        });
        parts = await partRepo.createMany(
          plan.map((p) => ({
            projectId,
            partNumber: p.partNumber,
            partLabel: p.partLabel,
            totalParts: p.totalParts,
            startTime: p.startTime,
            endTime: p.endTime,
            duration: p.duration,
          })),
        );
        await projectRepo.setTotalParts(projectId, plan.length);
        project = await projectRepo.findById(projectId);
        if (!project) throw new NotFoundError('ClipForgeProject', projectId);
      }

      // ── STEP 3: continuity validation ────────────────────────────────────
      if (!project.continuityValidated) {
        await projectRepo.updateStatus(projectId, 'CONTINUITY_VALIDATING');
        const result = validateContinuity(parts, project.sourceDuration!);

        await continuityRepo.create({
          projectId,
          valid: result.valid,
          sourceDuration: result.sourceDuration,
          coveredDuration: result.coveredDuration,
          missingRanges: result.missingRanges,
          overlapRanges: result.overlapRanges,
          duplicateRanges: result.duplicateRanges,
          validationDetails: result.details,
        });

        if (!result.valid) {
          await projectRepo.updateStatus(projectId, 'CONTINUITY_VALIDATION_FAILED', {
            failureReason: result.details.reasons.join('; '),
            failedAt: new Date(),
          });
          logger.error('Clip Forge continuity validation failed — refusing to render/upload', {
            projectId,
            reasons: result.details.reasons,
          });
          return { projectId, success: false, finalStatus: 'CONTINUITY_VALIDATION_FAILED' };
        }

        await projectRepo.updateStatus(projectId, 'PROCESSING', { continuityValidated: true });
        project = await projectRepo.findById(projectId);
        if (!project) throw new NotFoundError('ClipForgeProject', projectId);
      }

      // ── STEP 4: sequential per-part processing ───────────────────────────
      for (const part of parts.sort((a, b) => a.partNumber - b.partNumber)) {
        if (cancelledProjects.has(projectId)) {
          cancelledProjects.delete(projectId);
          logger.info('Clip Forge run paused by user — resumable from here', { projectId, atPartNumber: part.partNumber });
          return { projectId, success: false, finalStatus: 'PAUSED' };
        }

        // Idempotency gate — never re-render or re-upload an already-uploaded part.
        if (part.youtubeVideoId) {
          await projectRepo.setLastSuccessfulPart(projectId, part.partNumber);
          continue;
        }

        const localPartPath = getLocalPartPath(project.userId, project.id, part.partNumber);

        try {
          // a) RENDER
          let renderedStoragePath = part.renderedStoragePath;
          if (!renderedStoragePath) {
            await partRepo.updateStatus(part.id, 'RENDERING', { renderStartedAt: new Date() });

            await withRetry('render-part', projectId, () =>
              renderClipForgePart(ffmpegPath, {
                sourceVideoPath: localSourcePath,
                outputPath: localPartPath,
                startTime: part.startTime,
                endTime: part.endTime,
                width: getEnv().CLIP_FORGE_WIDTH,
                height: getEnv().CLIP_FORGE_HEIGHT,
                hasAudio: project.sourceHasAudio ?? true,
              }),
            );

            const persisted = await persistFile(localPartPath, 'video/mp4');
            renderedStoragePath = persisted.s3Key ?? localPartPath;
            await partRepo.setRendered(part.id, renderedStoragePath);
          }

          // b) SEO TITLE
          let seoTitle = part.seoTitle;
          let description = part.description;
          if (!seoTitle) {
            await partRepo.updateStatus(part.id, 'SEO_TITLE_GENERATING');
            const titleResult = await seoAgent.generateClipForgeTitle({
              originalVideoTitle: project.sourceTitle,
              partNumber: part.partNumber,
              totalParts: part.totalParts,
              startTime: part.startTime,
              endTime: part.endTime,
            });
            seoTitle = titleResult.title;
            description = buildDescription(project, part);
            await partRepo.setSeoTitle(part.id, seoTitle, description);
          }

          // c) UPLOAD — renderedStoragePath is either the local temp path itself
          // (remote storage not configured, persistFile was a no-op) or a
          // Supabase Storage key (persistFile deleted the local copy on
          // upload) — only the latter case needs re-materializing.
          await partRepo.updateStatus(part.id, 'UPLOADING');
          const partWasDownloadedForUpload =
            renderedStoragePath === localPartPath ? false : await ensureLocalFile(localPartPath, renderedStoragePath);

          let uploadResult;
          try {
            uploadResult = await uploadAgent.uploadToYouTube({
              videoPath: localPartPath,
              title: seoTitle,
              description: description ?? buildDescription(project, part),
              tags: [],
              hashtags: ['#Shorts'],
              category: '24',
              privacyStatus: getEnv().CLIP_FORGE_YOUTUBE_PRIVACY,
            });
          } catch (uploadErr) {
            await partRepo.incrementUploadAttempts(part.id);
            const message = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
            await partRepo.markFailed(part.id, message);

            if (isYouTubeQuotaError(uploadErr)) {
              await projectRepo.updateStatus(projectId, 'WAITING_FOR_YOUTUBE_QUOTA', { failureReason: message });
              logger.warn('YouTube quota/rate limit hit — pausing for later resume', { projectId, partNumber: part.partNumber });
              return { projectId, success: false, finalStatus: 'WAITING_FOR_YOUTUBE_QUOTA' };
            }

            await projectRepo.updateStatus(projectId, 'FAILED', { failureReason: message, failedAt: new Date() });
            logger.error('YouTube upload failed', { projectId, partNumber: part.partNumber, error: message });
            return { projectId, success: false, finalStatus: 'FAILED' };
          }

          await partRepo.setUploaded(part.id, uploadResult.platformVideoId, uploadResult.platformUrl);
          await projectRepo.setLastSuccessfulPart(projectId, part.partNumber);

          // d) CLEANUP — once uploaded, free ALL storage for this part: local
          // temp file, the Supabase Storage copy (if any), and the DB storage
          // reference. YouTube is now the canonical copy; only status,
          // youtubeVideoId/Url, and seoTitle are kept (needed for
          // idempotency + the parts-table UI).
          await safeDelete(localPartPath);
          if (isRemoteStorageEnabled() && renderedStoragePath !== localPartPath) {
            await deleteStorageObjects([renderedStoragePath]).catch((err) =>
              logger.warn('Non-fatal: failed to delete rendered part from remote storage', {
                projectId,
                partNumber: part.partNumber,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
          await partRepo.clearRenderedStoragePath(part.id);
          await releaseLocalFile(localPartPath, partWasDownloadedForUpload);

          logger.info('Clip Forge part uploaded and storage freed', {
            projectId,
            partNumber: part.partNumber,
            youtubeVideoId: uploadResult.platformVideoId,
          });
        } catch (err) {
          // Render/SEO-step failures (SEO itself never throws — it has an
          // internal fallback) land here; treat as a hard stop, resumable via retry.
          const message = err instanceof Error ? err.message : String(err);
          await partRepo.markFailed(part.id, message);
          await projectRepo.updateStatus(projectId, 'FAILED', { failureReason: message, failedAt: new Date() });
          logger.error('Clip Forge part processing failed', { projectId, partNumber: part.partNumber, error: message });
          return { projectId, success: false, finalStatus: 'FAILED' };
        }
      }

      // ── STEP 5: final validation ──────────────────────────────────────────
      const finalParts = await partRepo.findByProjectId(projectId);
      const finalValidation = validateContinuity(finalParts, project.sourceDuration!);
      const allUploaded = finalParts.every((p) => !!p.youtubeVideoId);
      const allTitled = finalParts.every((p) => !!p.seoTitle);
      const countMatches = finalParts.length === project.totalParts;

      if (finalValidation.valid && allUploaded && allTitled && countMatches) {
        await projectRepo.updateStatus(projectId, 'COMPLETED', { completedAt: new Date() });

        // Whole project done — free the source video storage too.
        await safeDelete(localSourcePath);
        if (isRemoteStorageEnabled() && project.sourceStoragePath) {
          await deleteStorageObjects([project.sourceStoragePath]).catch((err) =>
            logger.warn('Non-fatal: failed to delete source video from remote storage', {
              projectId,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
        await projectRepo.clearSourceStoragePath(projectId);

        logger.info('Clip Forge project completed', { projectId, totalParts: finalParts.length });
        return { projectId, success: true, finalStatus: 'COMPLETED' };
      }

      const reasons = [
        !finalValidation.valid && 'continuity validation failed on final check',
        !allUploaded && 'not every part has a youtubeVideoId',
        !allTitled && 'not every part has an SEO title',
        !countMatches && 'part count mismatch',
      ].filter(Boolean).join('; ');

      await projectRepo.updateStatus(projectId, 'PARTIALLY_COMPLETED', { failureReason: reasons });
      logger.warn('Clip Forge project ended PARTIALLY_COMPLETED', { projectId, reasons });
      return { projectId, success: false, finalStatus: 'PARTIALLY_COMPLETED' };
    } finally {
      if (localSourcePath) {
        await releaseLocalFile(localSourcePath, sourceWasDownloadedThisRun);
      }
      runningProjects.delete(projectId);
      cancelledProjects.delete(projectId);
    }
  },
};
