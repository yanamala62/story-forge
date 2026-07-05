import { createLogger, classifyPipelineError, NotFoundError } from '@storyforge/shared';
import { pipelineFlow } from '../utils/pipeline-flow.js';
import { PipelineLogBus } from './pipeline-log-bus.js';
import {
  EpisodeRepository,
  StoryRepository,
  CharacterRepository,
  MemoryRepository,
  AudioRepository,
  SubtitleRepository,
  VideoRepository,
  ImageRepository,
  SeoRepository,
  UploadRepository,
} from '@storyforge/database';
import { StoryAgentService } from '@storyforge/story-agent';
import { ImagePipelineService } from './image-pipeline.service.js';
import { NarrationPipelineService } from './narration-pipeline.service.js';
import { SubtitlePipelineService } from './subtitle-pipeline.service.js';
import { VideoPipelineService } from './video-pipeline.service.js';
import { SeoPipelineService } from './seo-pipeline.service.js';
import { UploadPipelineService } from './upload-pipeline.service.js';

const logger = createLogger('pipeline-orchestrator');

const episodeRepo = new EpisodeRepository();
const storyRepo = new StoryRepository();
const characterRepo = new CharacterRepository();
const memoryRepo = new MemoryRepository();
const audioRepo = new AudioRepository();
const subtitleRepo = new SubtitleRepository();
const videoRepo = new VideoRepository();
const imageRepo = new ImageRepository();
const seoRepo = new SeoRepository();
const uploadRepo = new UploadRepository();
const storyAgent = new StoryAgentService();

// In-memory guard: prevent concurrent pipeline runs for the same episode.
const runningEpisodes = new Set<string>();

// Cooperative cancellation: checked at each step boundary (M1..M7), not mid-step.
const cancelledEpisodes = new Set<string>();

const MAX_RETRIES_PER_STEP = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(stepName: string, episodeId: string, fn: () => Promise<T>): Promise<T> {
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      const classified = classifyPipelineError(err);

      if (classified.kind === 'FATAL') {
        logger.error('Pipeline fatal error — human intervention required', {
          episodeId, step: stepName, error: classified.message,
        });
        throw err;
      }

      if (attempt >= MAX_RETRIES_PER_STEP) {
        logger.error('Pipeline step exhausted retries', {
          episodeId, step: stepName, attempts: attempt, error: classified.message,
        });
        throw err;
      }

      const waitSec = Math.round(classified.retryAfterMs / 1000);
      pipelineFlow.stepRetry(episodeId, stepName, attempt, MAX_RETRIES_PER_STEP, classified.kind, waitSec);
      logger.warn('Pipeline step retrying', {
        episodeId, step: stepName, attempt, kind: classified.kind, waitSec,
      });
      await sleep(classified.retryAfterMs);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export interface OrchestratorStepResult {
  name: string;
  status: 'skipped' | 'completed' | 'failed';
  error?: string;
}

export interface OrchestratorResult {
  episodeId: string;
  steps: OrchestratorStepResult[];
  finalStatus: string;
  success: boolean;
}

export interface PipelineStep {
  id: string;
  name: string;
  status: 'completed' | 'running' | 'failed' | 'pending';
  error?: string | null;
}

export interface PipelineStatusResult {
  episodeId: string;
  status: string;
  processingError: string | null | undefined;
  completedSteps: string[];
  pendingSteps: string[];
  steps: PipelineStep[];
  detail: {
    sceneCount: number;
    imageCount: number;
    hasAudio: boolean;
    hasSubtitles: boolean;
    hasVideo: boolean;
    hasSeo: boolean;
    uploads: Array<{
      platform: string;
      status: string;
      platformVideoId: string | null;
      platformUrl: string | null;
    }>;
  };
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────

export const PipelineOrchestratorService = {
  isRunning(episodeId: string): boolean {
    return runningEpisodes.has(episodeId);
  },

  /**
   * Requests cancellation of a running pipeline. Cooperative: takes effect at the
   * next step boundary (M1..M7), not mid-step — an in-flight ffmpeg render or LLM
   * call is not interrupted. Returns false if the episode isn't currently running.
   */
  cancel(episodeId: string): boolean {
    if (!runningEpisodes.has(episodeId)) return false;
    cancelledEpisodes.add(episodeId);
    PipelineLogBus.emit(episodeId, 'warn', 'Cancellation requested — will stop at the next step boundary');
    return true;
  },

  /**
   * Fire-and-forget: starts the pipeline in background and returns immediately.
   * Use GET /pipeline/status to poll progress.
   */
  startInBackground(episodeId: string, opts: { uploadToYoutube?: boolean } = {}): void {
    if (runningEpisodes.has(episodeId)) {
      logger.warn('Pipeline already running for episode — ignoring duplicate start', { episodeId });
      return;
    }

    void PipelineOrchestratorService.run(episodeId, opts).catch((err) => {
      logger.error('Background pipeline crashed unexpectedly', {
        episodeId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  },

  /**
   * Run the full pipeline for an episode, resuming from the last checkpoint.
   *
   * Idempotent: each step queries the DB to check if its output already exists.
   * If it does, the step is skipped. Retries are driven by classifyPipelineError.
   *
   * Steps run in order: M1→M2→M3→M4→M5→M6→(M7 if uploadToYoutube=true).
   */
  async run(
    episodeId: string,
    opts: { uploadToYoutube?: boolean } = {},
  ): Promise<OrchestratorResult> {
    runningEpisodes.add(episodeId);

    const steps: OrchestratorStepResult[] = [];

    const pipelineStart = Date.now();

    try {
      // ── Load episode ───────────────────────────────────────────────────────
      const episode = await episodeRepo.findById(episodeId);
      if (!episode) throw new NotFoundError('Episode', episodeId);

      if (episode.status === 'PUBLISHED') {
        logger.info('Pipeline skipped — episode already published', { episodeId });
        return {
          episodeId,
          steps: [{ name: 'Already published', status: 'skipped' }],
          finalStatus: 'PUBLISHED',
          success: true,
        };
      }

      pipelineFlow.start(episodeId, episode.episodeNumber, episode.status, opts.uploadToYoutube ?? false);
      logger.info('Pipeline started', { episodeId, episodeNumber: episode.episodeNumber, currentStatus: episode.status });

      // ── Helper: bail out cleanly if cancel() was called since the last checkpoint ──
      const bailIfCancelled = async (): Promise<OrchestratorResult | null> => {
        if (!cancelledEpisodes.has(episodeId)) return null;
        cancelledEpisodes.delete(episodeId);
        const message = 'Cancelled by user';
        await episodeRepo.updateStatus(episodeId, 'FAILED', message);
        pipelineFlow.end(
          episodeId, false, 'FAILED', Date.now() - pipelineStart,
          steps.filter((s) => s.status === 'completed').length,
          steps.filter((s) => s.status === 'skipped').length,
        );
        logger.info('Pipeline cancelled by user', { episodeId });
        return { episodeId, steps, finalStatus: 'FAILED', success: false };
      };

      // ── Helper: run a single step with skip-if-done + visual flow row ──────
      const runStep = async (
        name: string,
        api: string,
        isDone: () => Promise<boolean>,
        run: () => Promise<void>,
      ): Promise<boolean> => {
        if (await isDone()) {
          pipelineFlow.stepSkip(episodeId, name);
          steps.push({ name, status: 'skipped' });
          return true;
        }

        const t0 = Date.now();
        pipelineFlow.stepCalling(episodeId, name, api);
        try {
          await withRetry(name, episodeId, run);
          pipelineFlow.stepDone(episodeId, name, Date.now() - t0);
          steps.push({ name, status: 'completed' });
          return true;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          pipelineFlow.stepFail(episodeId, name, Date.now() - t0, message);
          steps.push({ name, status: 'failed', error: message });
          await episodeRepo.updateStatus(episodeId, 'FAILED', message);
          logger.error('Pipeline step failed', { episodeId, step: name, error: message });
          return false;
        }
      };

      // ──────────────────────────────────────────────────────────────────────
      // M1: Story + Scenes
      // Done when: episode has at least one scene persisted in DB.
      // ──────────────────────────────────────────────────────────────────────
      const cancelled1 = await bailIfCancelled();
      if (cancelled1) return cancelled1;
      const ok1 = await runStep(
        'M1: Story + Scenes',
        'OpenRouter LLM',
        async () => {
          const ep = await episodeRepo.findById(episodeId);
          return (ep?.scenes.length ?? 0) > 0;
        },
        async () => {
          const story = await storyRepo.findById(episode.storyId);
          if (!story) throw new NotFoundError('Story', episode.storyId);

          await episodeRepo.updateStatus(episodeId, 'GENERATING_STORY');

          const { episode: generated, updatedMemory } = await storyAgent.generateEpisode({
            story,
            episodeNumber: episode.episodeNumber,
          });

          // Persist to the EXISTING episode (orchestrator always resumes, never creates)
          await episodeRepo.update(episodeId, {
            title: generated.title,
            content: generated.content,
            hook: generated.hook,
            cliffhanger: generated.cliffhanger,
          });

          await episodeRepo.createScenes(
            generated.scenes.map((s) => ({
              episodeId,
              sceneNumber: s.sceneNumber,
              description: s.description,
              narration: s.narration,
              mood: s.mood,
              duration: s.duration,
              characters: s.characters,
              location: s.location,
            })),
          );

          if (generated.newCharacters.length > 0) {
            await characterRepo.createMany(
              generated.newCharacters.map((c) => ({ ...c, storyId: episode.storyId })),
            );
          }

          const mentionedCharacters = generated.scenes.flatMap((s) => s.characters);
          if (mentionedCharacters.length > 0) {
            await characterRepo.incrementAppearances(episode.storyId, mentionedCharacters);
          }

          await memoryRepo.upsert(episode.storyId, updatedMemory);
          await storyRepo.incrementEpisodeCount(episode.storyId);
          await episodeRepo.updateStatus(episodeId, 'GENERATING_SCENES');
        },
      );
      if (!ok1) { pipelineFlow.end(episodeId, false, 'FAILED', Date.now() - pipelineStart, 0, steps.filter((s) => s.status === 'skipped').length); return { episodeId, steps, finalStatus: 'FAILED', success: false }; }

      // ──────────────────────────────────────────────────────────────────────
      // M2: Image Generation (prompts + images)
      // Done when: every scene has a GeneratedImage record.
      // ──────────────────────────────────────────────────────────────────────
      const cancelled2 = await bailIfCancelled();
      if (cancelled2) return cancelled2;
      const sceneCount = (await episodeRepo.findById(episodeId))?.scenes.length ?? 0;
      const ok2 = await runStep(
        'M2: Image Generation',
        `Pollinations.ai × ${sceneCount} scenes`,
        async () => {
          const ep = await episodeRepo.findById(episodeId);
          const sceneCount = ep?.scenes.length ?? 0;
          if (sceneCount === 0) return false;
          const images = await imageRepo.findByEpisodeScenes(episodeId);
          return images.length >= sceneCount;
        },
        async () => {
          await ImagePipelineService.generateImagesForEpisode(episodeId);
        },
      );
      if (!ok2) { pipelineFlow.end(episodeId, false, 'FAILED', Date.now() - pipelineStart, 0, steps.filter((s) => s.status === 'skipped').length); return { episodeId, steps, finalStatus: 'FAILED', success: false }; }

      // M3 ───────────────────────────────────────────────────────────────────
      const cancelled3 = await bailIfCancelled();
      if (cancelled3) return cancelled3;
      const ok3 = await runStep(
        'M3: Narration (TTS)',
        'edge-tts subprocess',
        async () => !!(await audioRepo.findByEpisodeId(episodeId)),
        async () => { await NarrationPipelineService.generateNarrationForEpisode(episodeId); },
      );
      if (!ok3) { pipelineFlow.end(episodeId, false, 'FAILED', Date.now() - pipelineStart, 0, steps.filter((s) => s.status === 'skipped').length); return { episodeId, steps, finalStatus: 'FAILED', success: false }; }

      // M4 ───────────────────────────────────────────────────────────────────
      const cancelled4 = await bailIfCancelled();
      if (cancelled4) return cancelled4;
      const ok4 = await runStep(
        'M4: Subtitles (Whisper)',
        'faster-whisper subprocess',
        async () => !!(await subtitleRepo.findByEpisodeId(episodeId)),
        async () => { await SubtitlePipelineService.generateSubtitlesForEpisode(episodeId); },
      );
      if (!ok4) { pipelineFlow.end(episodeId, false, 'FAILED', Date.now() - pipelineStart, 0, steps.filter((s) => s.status === 'skipped').length); return { episodeId, steps, finalStatus: 'FAILED', success: false }; }

      // M5 ───────────────────────────────────────────────────────────────────
      const cancelled5 = await bailIfCancelled();
      if (cancelled5) return cancelled5;
      const ok5 = await runStep(
        'M5: Video Composition',
        'FFmpeg two-pass',
        async () => !!(await videoRepo.findByEpisodeId(episodeId)),
        async () => { await VideoPipelineService.composeVideoForEpisode(episodeId); },
      );
      if (!ok5) { pipelineFlow.end(episodeId, false, 'FAILED', Date.now() - pipelineStart, 0, steps.filter((s) => s.status === 'skipped').length); return { episodeId, steps, finalStatus: 'FAILED', success: false }; }

      // M6 ───────────────────────────────────────────────────────────────────
      const cancelled6 = await bailIfCancelled();
      if (cancelled6) return cancelled6;
      const ok6 = await runStep(
        'M6: SEO Generation',
        'OpenRouter LLM',
        async () => {
          const video = await videoRepo.findByEpisodeId(episodeId);
          if (!video) return false;
          return !!(await seoRepo.findByVideoId(video.id));
        },
        async () => { await SeoPipelineService.generateSeoForEpisode(episodeId); },
      );
      if (!ok6) { pipelineFlow.end(episodeId, false, 'FAILED', Date.now() - pipelineStart, 0, steps.filter((s) => s.status === 'skipped').length); return { episodeId, steps, finalStatus: 'FAILED', success: false }; }

      // M7 (optional) ────────────────────────────────────────────────────────
      if (opts.uploadToYoutube) {
        const cancelled7 = await bailIfCancelled();
        if (cancelled7) return cancelled7;
        const ok7 = await runStep(
          'M7: YouTube Upload',
          'YouTube Data API v3',
          async () => {
            const video = await videoRepo.findByEpisodeId(episodeId);
            if (!video) return false;
            const upload = await uploadRepo.findByEpisodeAndPlatform(video.id, 'YOUTUBE');
            return upload?.status === 'PUBLISHED';
          },
          async () => {
            if (!UploadPipelineService.isYouTubeConfigured()) {
              throw new Error('YouTube credentials not configured — set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN in .env');
            }
            await UploadPipelineService.uploadToYouTube(episodeId);
          },
        );
        if (!ok7) { pipelineFlow.end(episodeId, false, 'FAILED', Date.now() - pipelineStart, 0, steps.filter((s) => s.status === 'skipped').length); return { episodeId, steps, finalStatus: 'FAILED', success: false }; }
      }

      // ── Done ───────────────────────────────────────────────────────────────
      const finalEpisode = await episodeRepo.findById(episodeId);
      const finalStatus = finalEpisode?.status ?? 'UNKNOWN';

      const completedCount = steps.filter((s) => s.status === 'completed').length;
      const skippedCount  = steps.filter((s) => s.status === 'skipped').length;
      pipelineFlow.end(episodeId, true, finalStatus, Date.now() - pipelineStart, completedCount, skippedCount);
      logger.info('Pipeline completed', { episodeId, finalStatus, completedCount, skippedCount });

      return { episodeId, steps, finalStatus, success: true };
    } finally {
      runningEpisodes.delete(episodeId);
      cancelledEpisodes.delete(episodeId);
    }
  },

  /**
   * Returns what steps are done/pending, derived from actual DB records.
   * Does NOT require the pipeline to be running.
   */
  async getStatus(episodeId: string): Promise<PipelineStatusResult> {
    const episode = await episodeRepo.findById(episodeId);
    if (!episode) throw new NotFoundError('Episode', episodeId);

    const [images, audio, subtitle, video] = await Promise.all([
      imageRepo.findByEpisodeScenes(episodeId),
      audioRepo.findByEpisodeId(episodeId),
      subtitleRepo.findByEpisodeId(episodeId),
      videoRepo.findByEpisodeId(episodeId),
    ]);

    const seo = video ? await seoRepo.findByVideoId(video.id) : null;
    const allUploads = video ? await uploadRepo.findByVideoId(video.id) : [];
    const ytPublished = allUploads.find(
      (u) => u.platform === 'YOUTUBE' && u.status === 'PUBLISHED',
    );

    const completedSteps: string[] = [];
    if (episode.scenes.length > 0) completedSteps.push('M1: Story + Scenes');
    if (images.length > 0 && images.length >= episode.scenes.length) completedSteps.push('M2: Images');
    if (audio) completedSteps.push('M3: Narration');
    if (subtitle) completedSteps.push('M4: Subtitles');
    if (video) completedSteps.push('M5: Video');
    if (seo) completedSteps.push('M6: SEO');
    if (ytPublished) completedSteps.push('M7: YouTube Upload');

    const ALL_STEPS = [
      'M1: Story + Scenes',
      'M2: Images',
      'M3: Narration',
      'M4: Subtitles',
      'M5: Video',
      'M6: SEO',
      'M7: YouTube Upload',
    ];
    const pendingSteps = ALL_STEPS.filter((s) => !completedSteps.includes(s));

    // ── Compute structured steps[] for the workflow dot UI ─────────────────
    const ALL_PIPELINE_STEPS: Array<{ id: string; name: string }> = [
      { id: 'M1', name: 'M1: Story + Scenes' },
      { id: 'M2', name: 'M2: Images' },
      { id: 'M3', name: 'M3: Narration' },
      { id: 'M4', name: 'M4: Subtitles' },
      { id: 'M5', name: 'M5: Video' },
      { id: 'M6', name: 'M6: SEO' },
      { id: 'M7', name: 'M7: YouTube Upload' },
    ];

    // When the episode is FAILED, the first pending step is the one that failed.
    const failedStepName = episode.status === 'FAILED' ? pendingSteps[0] : null;

    const steps: PipelineStep[] = ALL_PIPELINE_STEPS.map((s) => {
      if (completedSteps.some((c) => c.startsWith(s.id))) {
        return { ...s, status: 'completed' as const };
      }
      if (failedStepName?.startsWith(s.id)) {
        return { ...s, status: 'failed' as const, error: episode.processingError ?? null };
      }
      return { ...s, status: 'pending' as const };
    });

    return {
      episodeId,
      status: episode.status,
      processingError: episode.processingError,
      completedSteps,
      pendingSteps,
      steps,
      detail: {
        sceneCount: episode.scenes.length,
        imageCount: images.length,
        hasAudio: !!audio,
        hasSubtitles: !!subtitle,
        hasVideo: !!video,
        hasSeo: !!seo,
        uploads: allUploads.map((u) => ({
          platform: u.platform,
          status: u.status,
          platformVideoId: u.platformVideoId,
          platformUrl: u.platformUrl,
        })),
      },
      updatedAt: episode.updatedAt,
    };
  },
};
