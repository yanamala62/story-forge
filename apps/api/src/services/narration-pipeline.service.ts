import { createLogger, NotFoundError } from '@storyforge/shared';
import { EpisodeRepository, AudioRepository } from '@storyforge/database';
import { NarrationAgentService, type EdgeTTSVoice } from '@storyforge/narration-agent';

const logger = createLogger('narration-pipeline');

const episodeRepo = new EpisodeRepository();
const audioRepo = new AudioRepository();
const narrationAgent = new NarrationAgentService();

export interface NarrationPipelineResult {
  episodeId: string;
  audioPath: string;
  filename: string;
  duration: number;
  voice: string;
  sceneCount: number;
}

export const NarrationPipelineService = {
  async generateNarrationForEpisode(
    episodeId: string,
    voice?: string,
  ): Promise<NarrationPipelineResult> {
    logger.info('Starting narration pipeline', { episodeId });

    const episode = await episodeRepo.findById(episodeId);
    if (!episode) throw new NotFoundError('Episode', episodeId);
    if (!episode.scenes.length) throw new Error('Episode has no scenes — run story generation first');

    await episodeRepo.updateStatus(episodeId, 'GENERATING_AUDIO');

    const sceneNarrations = episode.scenes.map((s) => ({
      sceneNumber: s.sceneNumber,
      narration: s.narration,
    }));
    let result;
    if (voice) {
      result = await narrationAgent.generateNarration({
        episodeId,
        sceneNarrations,
        voice: voice as EdgeTTSVoice,
      });
    } else {
      result = await narrationAgent.generateNarration({ episodeId, sceneNarrations });
    }

    // Save to database
    await audioRepo.upsert({
      episodeId,
      filename: result.filename,
      localPath: result.localPath,
      duration: result.duration,
      voice: result.voice,
      sampleRate: 24000,
    });

    logger.info('Narration pipeline complete', {
      episodeId,
      duration: result.duration,
      voice: result.voice,
    });

    return {
      episodeId,
      audioPath: result.localPath,
      filename: result.filename,
      duration: result.duration,
      voice: result.voice,
      sceneCount: episode.scenes.length,
    };
  },

  async getEpisodeAudio(episodeId: string) {
    return audioRepo.findByEpisodeId(episodeId);
  },
};
