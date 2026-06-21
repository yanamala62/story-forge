import { createLogger, NotFoundError } from '@storyforge/shared';
import { EpisodeRepository, AudioRepository, SubtitleRepository } from '@storyforge/database';
import { SubtitleAgentService } from '@storyforge/subtitle-agent';

const logger = createLogger('subtitle-pipeline');

const episodeRepo = new EpisodeRepository();
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

    // Verify episode exists
    const episode = await episodeRepo.findById(episodeId);
    if (!episode) throw new NotFoundError('Episode', episodeId);

    // Get narration audio path
    const audioFile = await audioRepo.findByEpisodeId(episodeId);
    if (!audioFile) {
      throw new Error('No narration audio found — run narration generation first');
    }

    await episodeRepo.updateStatus(episodeId, 'GENERATING_SUBTITLES');

    const result = await subtitleAgent.generateSubtitles({
      episodeId,
      audioPath: audioFile.localPath,
    });

    // Save to database
    await subtitleRepo.upsert({
      episodeId,
      filename: result.filename,
      localPath: result.localPath,
      language: result.language,
    });

    logger.info('Subtitle pipeline complete', {
      episodeId,
      entryCount: result.entryCount,
    });

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
