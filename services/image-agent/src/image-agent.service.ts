import { createLogger, getEnv, AgentError, persistFile } from '@storyforge/shared';
import { join } from 'path';
import { generateImageWithPollinations } from './providers/pollinations.provider.js';

const logger = createLogger('image-agent');

export interface GenerateImageInput {
  episodeId: string;
  sceneNumber: number;
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
  language?: string;
}

export interface GenerateImageResult {
  localPath: string;
  filename: string;
  width: number;
  height: number;
  seed: number;
  s3Key: string | null;
  s3Url: string | null;
}

export class ImageAgentService {
  private readonly storageBasePath: string;
  private readonly width: number;
  private readonly height: number;

  constructor() {
    const env = getEnv();
    this.storageBasePath = env.STORAGE_LOCAL_PATH;
    this.width = env.VIDEO_WIDTH;
    this.height = env.VIDEO_HEIGHT;
  }

  async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
    const filename = `scene-${String(input.sceneNumber).padStart(2, '0')}.png`;
    const lang = (input.language ?? 'EN').toLowerCase();
    // Language-prefixed path: generated/images/<lang>/<episodeId>/scene-01.png
    const outputPath = join(
      process.cwd(),
      this.storageBasePath,
      'images',
      lang,
      input.episodeId,
      filename,
    );

    logger.info('Generating image for scene', {
      episodeId: input.episodeId,
      sceneNumber: input.sceneNumber,
      seed: input.seed,
      outputPath,
    });

    try {
      const result = await generateImageWithPollinations({
        positivePrompt: input.positivePrompt,
        negativePrompt: input.negativePrompt,
        width: this.width,
        height: this.height,
        seed: input.seed,
        outputPath,
      });

      logger.info('Image generated successfully', {
        sceneNumber: input.sceneNumber,
        localPath: result.localPath,
      });

      const { s3Key, s3Url } = await persistFile(result.localPath, 'image/png');

      return {
        localPath: result.localPath,
        filename,
        width: result.width,
        height: result.height,
        seed: result.seed,
        s3Key,
        s3Url,
      };
    } catch (error) {
      throw new AgentError(
        'image-agent',
        `Failed to generate image for scene ${input.sceneNumber}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  async generateImagesForEpisode(
    inputs: GenerateImageInput[],
    onProgress?: (sceneNumber: number, total: number) => void,
  ): Promise<GenerateImageResult[]> {
    const results: GenerateImageResult[] = [];

    // Generate sequentially to respect Pollinations rate limits
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]!;
      const result = await this.generateImage(input);
      results.push(result);
      onProgress?.(i + 1, inputs.length);

      // Small delay between requests to be respectful to free API
      if (i < inputs.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return results;
  }
}
