import { createLogger, NotFoundError, ConflictError } from '@storyforge/shared';
import { StoryRepository, EpisodeRepository } from '@storyforge/database';
import { UploadPipelineService } from './upload-pipeline.service.js';
import { PipelineOrchestratorService } from './pipeline-orchestrator.service.js';

const logger = createLogger('scheduler');

const storyRepo = new StoryRepository();
const episodeRepo = new EpisodeRepository();

let lastRunAt: Date | null = null;
let totalTriggered = 0;

export interface TriggerNextEpisodeResult {
  storyId: string;
  episodeId: string;
  episodeNumber: number;
  resumed: boolean;
}

export const SchedulerService = {
  /**
   * Resolve the episode to run for a single story — skip if one is already
   * in-flight, retry the latest FAILED episode if there is one (resuming
   * from checkpoint), otherwise create the next episode shell — then start
   * the pipeline directly in-process (same path the Episode Detail page's
   * "Run/Resume" button uses).
   */
  async triggerNextEpisodeForStory(storyId: string): Promise<TriggerNextEpisodeResult> {
    const story = await storyRepo.findById(storyId);
    if (!story) throw new NotFoundError('Story', storyId);

    const shouldUpload = UploadPipelineService.isYouTubeConfigured();

    const inFlight = await episodeRepo.findInFlightEpisode(storyId);
    if (inFlight) {
      throw new ConflictError(`Episode ${inFlight.id} is already in-flight (status: ${inFlight.status})`);
    }

    const latestFailed = await episodeRepo.findLatestFailedEpisode(storyId);

    let episodeId: string;
    let episodeNumber: number;
    let resumed: boolean;

    if (latestFailed) {
      logger.info('Retrying latest failed episode', {
        storyId,
        episodeId: latestFailed.id,
        episodeNumber: latestFailed.episodeNumber,
      });
      await episodeRepo.updateStatus(latestFailed.id, 'PENDING', null);
      episodeId = latestFailed.id;
      episodeNumber = latestFailed.episodeNumber;
      resumed = true;
    } else {
      episodeNumber = await episodeRepo.getNextEpisodeNumber(storyId);
      const episode = await episodeRepo.create({
        storyId,
        episodeNumber,
        title: `Episode ${episodeNumber}`,
        content: '',
        hook: '',
        cliffhanger: '',
        duration: 40,
      });
      episodeId = episode.id;
      resumed = false;
    }

    lastRunAt = new Date();
    totalTriggered += 1;

    logger.info('Pipeline triggered for story', { storyId, episodeId, episodeNumber, resumed });
    PipelineOrchestratorService.startInBackground(episodeId, { uploadToYoutube: shouldUpload });

    return { storyId, episodeId, episodeNumber, resumed };
  },

  getStatus() {
    return {
      lastRunAt: lastRunAt?.toISOString() ?? null,
      totalTriggered,
    };
  },
};
