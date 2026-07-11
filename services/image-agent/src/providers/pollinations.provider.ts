import { createLogger, withRetry, withTimeout, StorageError } from '@storyforge/shared';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

const logger = createLogger('pollinations-provider');

const BASE_URL = 'https://image.pollinations.ai/prompt';

export interface PollinationsRequest {
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  seed: number;
  outputPath: string;
}

export interface PollinationsResult {
  localPath: string;
  width: number;
  height: number;
  seed: number;
}

export async function generateImageWithPollinations(
  request: PollinationsRequest,
  onRetry?: (attempt: number, maxAttempts: number, error: string) => void,
): Promise<PollinationsResult> {
  const { positivePrompt, negativePrompt, width, height, seed, outputPath } = request;

  // Pollinations encodes the prompt in the URL path
  const encodedPrompt = encodeURIComponent(positivePrompt.slice(0, 1500));

  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    model: 'flux',
    nologo: 'true',
    enhance: 'false',
    negative_prompt: negativePrompt.slice(0, 500),
  });

  const url = `${BASE_URL}/${encodedPrompt}?${params.toString()}`;

  logger.debug('Requesting image from Pollinations', { seed, width, height });

  const imageBuffer = await withRetry(
    () => withTimeout(fetchImage(url), 120_000, 'Pollinations image generation timed out'),
    {
      maxAttempts: 3,
      initialDelayMs: 5000,
      maxDelayMs: 20000,
      onRetry: (err, attempt) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('Retrying Pollinations request', { attempt, error: message });
        onRetry?.(attempt, 3, message);
      },
    },
  );

  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });

  // Save image to disk
  await writeFile(outputPath, imageBuffer);

  logger.info('Image saved', { outputPath, sizeBytes: imageBuffer.length });

  return {
    localPath: outputPath,
    width,
    height,
    seed,
  };
}

async function fetchImage(url: string): Promise<Buffer> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'StoryForge-AI/1.0',
        Accept: 'image/png,image/*',
      },
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new StorageError(
      `Failed to connect to Pollinations: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    throw new StorageError(`Pollinations returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('image')) {
    const text = await response.text().catch(() => '');
    throw new StorageError(`Pollinations returned non-image content: ${text.slice(0, 200)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
