import { createLogger, getEnv, AgentError } from '@storyforge/shared';
import { join } from 'path';
import { transcribeWithWhisper } from './providers/whisper.provider.js';

const logger = createLogger('subtitle-agent');

// Maps ContentLanguage enum values to BCP-47 codes Whisper understands
const WHISPER_LANG: Record<string, string> = {
  EN: 'en',
  HI: 'hi',
  TE: 'te',
};

export interface GenerateSubtitlesInput {
  episodeId: string;
  audioPath: string;
  language?: string;
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
    const language = input.language ?? 'EN';
    const modelSize = input.modelSize ?? this.whisperModel;
    const whisperLang = WHISPER_LANG[language] ?? 'en';

    logger.info('Starting subtitle generation', {
      episodeId,
      audioPath,
      language,
      whisperLang,
      model: modelSize,
    });

    const filename = 'subtitles.srt';
    // Language-prefixed output path: generated/subtitles/<lang>/<episodeId>/subtitles.srt
    const outputPath = join(
      process.cwd(),
      this.storageBasePath,
      'subtitles',
      language.toLowerCase(),
      episodeId,
      filename,
    );

    try {
      const result = await transcribeWithWhisper({
        audioPath,
        outputSrtPath: outputPath,
        modelSize,
        language: whisperLang,
      });

      logger.info('Subtitle generation complete', {
        episodeId,
        language,
        entryCount: result.entryCount,
        sizeBytes: result.sizeBytes,
      });

      return {
        localPath: result.srtPath,
        filename,
        entryCount: result.entryCount,
        language: whisperLang,
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
