import { createLogger, getEnv, AgentError } from '@storyforge/shared';
import { join } from 'path';
import {
  generateNarrationWithEdgeTTS,
  buildNarrationText,
  type EdgeTTSVoice,
} from './providers/edge-tts.provider.js';

const logger = createLogger('narration-agent');

export interface GenerateNarrationInput {
  episodeId: string;
  sceneNarrations: Array<{ sceneNumber: number; narration: string }>;
  voice?: EdgeTTSVoice;
}

export interface GenerateNarrationResult {
  localPath: string;
  filename: string;
  duration: number;
  voice: string;
  characterCount: number;
  fullText: string;
}

export class NarrationAgentService {
  private readonly storageBasePath: string;
  private readonly defaultVoice: EdgeTTSVoice;

  constructor() {
    const env = getEnv();
    this.storageBasePath = env.STORAGE_LOCAL_PATH;
    // Default voice — can be overridden per request
    this.defaultVoice = 'en-US-JennyNeural';
  }

  async generateNarration(input: GenerateNarrationInput): Promise<GenerateNarrationResult> {
    const { episodeId, sceneNarrations } = input;
    const voice = input.voice ?? this.defaultVoice;

    logger.info('Starting narration generation', {
      episodeId,
      sceneCount: sceneNarrations.length,
      voice,
    });

    if (!sceneNarrations.length) {
      throw new AgentError('narration-agent', 'No scene narrations provided');
    }

    // Sort by scene number and build full narration text
    const sorted = [...sceneNarrations].sort((a, b) => a.sceneNumber - b.sceneNumber);
    const fullText = buildNarrationText(sorted.map((s) => s.narration));

    const filename = 'narration.mp3';
    const outputPath = join(
      process.cwd(),
      this.storageBasePath,
      'audio',
      episodeId,
      filename,
    );

    try {
      const result = await generateNarrationWithEdgeTTS({
        text: fullText,
        outputPath,
        voice,
      });

      logger.info('Narration generation complete', {
        episodeId,
        duration: result.duration,
        localPath: result.localPath,
      });

      return {
        localPath: result.localPath,
        filename,
        duration: result.duration,
        voice: result.voice,
        characterCount: result.characterCount,
        fullText,
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
