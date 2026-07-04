import { createLogger, getEnv, AgentError } from '@storyforge/shared';
import { join } from 'path';
import {
  generateNarrationWithEdgeTTS,
  buildNarrationText,
  LANGUAGE_DEFAULT_VOICE,
  type EdgeTTSVoice,
} from './providers/edge-tts.provider.js';

const logger = createLogger('narration-agent');

export interface GenerateNarrationInput {
  episodeId: string;
  sceneNarrations: Array<{ sceneNumber: number; narration: string }>;
  language?: string;
  voice?: EdgeTTSVoice;
}

export interface GenerateNarrationResult {
  localPath: string;
  filename: string;
  duration: number;
  voice: string;
  characterCount: number;
  fullText: string;
  language: string;
}

export class NarrationAgentService {
  private readonly storageBasePath: string;

  constructor() {
    const env = getEnv();
    this.storageBasePath = env.STORAGE_LOCAL_PATH;
  }

  async generateNarration(input: GenerateNarrationInput): Promise<GenerateNarrationResult> {
    const { episodeId, sceneNarrations } = input;
    const language = input.language ?? 'EN';

    // Voice priority: explicit voice param > language default
    const voice: EdgeTTSVoice =
      input.voice ?? LANGUAGE_DEFAULT_VOICE[language] ?? 'en-US-JennyNeural';

    logger.info('Starting narration generation', {
      episodeId,
      sceneCount: sceneNarrations.length,
      language,
      voice,
    });

    if (!sceneNarrations.length) {
      throw new AgentError('narration-agent', 'No scene narrations provided');
    }

    const sorted = [...sceneNarrations].sort((a, b) => a.sceneNumber - b.sceneNumber);
    const fullText = buildNarrationText(sorted.map((s) => s.narration));

    const filename = 'narration.mp3';
    // Language-prefixed output path: generated/audio/<lang>/<episodeId>/narration.mp3
    const outputPath = join(
      process.cwd(),
      this.storageBasePath,
      'audio',
      language.toLowerCase(),
      episodeId,
      filename,
    );

    try {
      const result = await generateNarrationWithEdgeTTS({ text: fullText, outputPath, voice });

      logger.info('Narration generation complete', {
        episodeId,
        duration: result.duration,
        localPath: result.localPath,
        language,
      });

      return {
        localPath: result.localPath,
        filename,
        duration: result.duration,
        voice: result.voice,
        characterCount: result.characterCount,
        fullText,
        language,
      };
    } catch (error) {
      throw new AgentError(
        'narration-agent',
        `Failed to generate narration: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
