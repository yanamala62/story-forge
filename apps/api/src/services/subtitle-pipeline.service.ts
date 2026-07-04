import { createLogger, NotFoundError } from '@storyforge/shared';
import { EpisodeRepository, AudioRepository, SubtitleRepository, StoryRepository } from '@storyforge/database';
import { SubtitleAgentService } from '@storyforge/subtitle-agent';

const logger = createLogger('subtitle-pipeline');

const episodeRepo = new EpisodeRepository();
const storyRepo = new StoryRepository();
const audioRepo = new AudioRepository();
const subtitleRepo = new SubtitleRepository();
const subtitleAgent = new SubtitleAgentService();

export interface SubtitlePipelineResult {
  episodeId: string;
  srtPath: string;
  filename: string;
  entryCount: number;
  language: string;
}

export const SubtitlePipelineService = {
  async generateSubtitlesForEpisode(episodeId: string): Promise<SubtitlePipelineResult> {
    logger.info('Starting subtitle pipeline', { episodeId });

    const episode = await episodeRepo.findById(episodeId);
    if (!episode) throw new NotFoundError('Episode', episodeId);

    const story = await storyRepo.findById(episode.storyId);
    const language = String(story?.language ?? 'EN');

    const audioFile = await audioRepo.findByEpisodeId(episodeId);
    if (!audioFile) {
      throw new Error('No narration audio found — run narration generation first');
    }

    await episodeRepo.updateStatus(episodeId, 'GENERATING_SUBTITLES');

    const result = await subtitleAgent.generateSubtitles({
      episodeId,
      audioPath: audioFile.localPath,
      language,
    });

    await subtitleRepo.upsert({
      episodeId,
      filename: result.filename,
      localPath: result.localPath,
      language: result.language,
    });

    logger.info('Subtitle pipeline complete', { episodeId, language, entryCount: result.entryCount });

    return {
      episodeId,
      srtPath: result.localPath,
      filename: result.filename,
      entryCount: result.entryCount,
      language: result.language,
    };
  },

  async getEpisodeSubtitles(episodeId: string) {
    return subtitleRepo.findByEpisodeId(episodeId);
  },
};
