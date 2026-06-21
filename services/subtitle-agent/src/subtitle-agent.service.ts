import { createLogger, getEnv, AgentError } from '@storyforge/shared';
import { join } from 'path';
import { transcribeWithWhisper } from './providers/whisper.provider.js';

const logger = createLogger('subtitle-agent');

export interface GenerateSubtitlesInput {
  episodeId: string;
  audioPath: string;
  modelSize?: string;
}

export interface GenerateSubtitlesResult {
  localPath: string;
  filename: string;
  entryCount: number;
  language: string;
}

export class SubtitleAgentService {
  private readonly storageBasePath: string;
  private readonly whisperModel: string;

  constructor() {
    const env = getEnv();
    this.storageBasePath = env.STORAGE_LOCAL_PATH;
    this.whisperModel = env.WHISPER_MODEL;
  }

  async generateSubtitles(input: GenerateSubtitlesInput): Promise<GenerateSubtitlesResult> {
    const { episodeId, audioPath } = input;
    const modelSize = input.modelSize ?? this.whisperModel;

    logger.info('Starting subtitle generation', {
      episodeId,
      audioPath,
      model: modelSize,
    });

    const filename = 'subtitles.srt';
    const outputPath = join(
      process.cwd(),
      this.storageBasePath,
      'subtitles',
      episodeId,
      filename,
    );

    try {
      const result = await transcribeWithWhisper({
        audioPath,
        outputSrtPath: outputPath,
        modelSize,
        language: 'en',
      });

      logger.info('Subtitle generation complete', {
        episodeId,
        entryCount: result.entryCount,
        sizeBytes: result.sizeBytes,
      });

      return {
        localPath: result.srtPath,
        filename,
        entryCount: result.entryCount,
        language: 'en',
      };
    } catch (error) {
      throw new AgentError(
        'subtitle-agent',
        `Failed to generate subtitles: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
