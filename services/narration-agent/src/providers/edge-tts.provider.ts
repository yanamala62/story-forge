import { createLogger, StorageError, withRetry } from '@storyforge/shared';
import { mkdir, writeFile, unlink, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const logger = createLogger('edge-tts-provider');

export const EDGE_TTS_VOICES = {
  'en-US-JennyNeural': 'Jenny (Female, US, warm & natural)',
  'en-US-GuyNeural': 'Guy (Male, US, confident)',
  'en-US-AriaNeural': 'Aria (Female, US, newscast)',
  'en-US-DavisNeural': 'Davis (Male, US, casual)',
  'en-US-NancyNeural': 'Nancy (Female, US, pleasant)',
  'en-GB-SoniaNeural': 'Sonia (Female, UK, clear)',
  'en-AU-NatashaNeural': 'Natasha (Female, AU, friendly)',
} as const;

export type EdgeTTSVoice = keyof typeof EDGE_TTS_VOICES;

export interface EdgeTTSRequest {
  text: string;
  outputPath: string;
  voice?: EdgeTTSVoice;
}

export interface EdgeTTSResult {
  localPath: string;
  duration: number;
  voice: string;
  characterCount: number;
}

// Path to the Python TTS script bundled with this service
const TTS_SCRIPT = join(__dirname, '..', '..', 'scripts', 'tts.py');

export async function generateNarrationWithEdgeTTS(
  request: EdgeTTSRequest,
): Promise<EdgeTTSResult> {
  const { text, outputPath, voice = 'en-US-JennyNeural' } = request;

  await mkdir(dirname(outputPath), { recursive: true });

  // Write text to temp file to avoid shell-escaping long strings
  const tempTextFile = `${outputPath}.tmp.txt`;
  await writeFile(tempTextFile, text, 'utf-8');

  logger.debug('Starting Python edge-tts generation', {
    voice,
    textLength: text.length,
    outputPath,
  });

  try {
    await withRetry(
      async () => {
        // Try 'python' first (Windows), fall back to 'python3' (Linux/Mac)
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

        const { stdout, stderr } = await execFileAsync(
          pythonCmd,
          [TTS_SCRIPT, tempTextFile, voice, outputPath],
          { timeout: 60_000 },
        );

        if (stderr && !stdout.startsWith('OK:')) {
          logger.warn('Python TTS stderr output', { stderr });
        }

        if (!stdout.trim().startsWith('OK:')) {
          throw new StorageError(`TTS script failed: ${stderr || stdout}`);
        }

        logger.debug('Python edge-tts stdout', { stdout: stdout.trim() });
      },
      {
        maxAttempts: 3,
        initialDelayMs: 2000,
        maxDelayMs: 8000,
        onRetry: (err, attempt) => {
          logger.warn('Retrying edge-tts generation', {
            attempt,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      },
    );
  } finally {
    await unlink(tempTextFile).catch(() => {});
  }

  // Verify output file exists
  let fileSize = 0;
  try {
    const fileStat = await stat(outputPath);
    fileSize = fileStat.size;
  } catch {
    throw new StorageError(`Audio file was not created at ${outputPath}`);
  }

  logger.info('Narration audio generated', { outputPath, sizeBytes: fileSize, voice });

  // Estimate duration (~2.3 words/second narrative pace)
  const wordCount = text.trim().split(/\s+/).length;
  const duration = Math.ceil(wordCount / 2.3);

  return {
    localPath: outputPath,
    duration,
    voice,
    characterCount: text.length,
  };
}

export function buildNarrationText(sceneNarrations: string[]): string {
  return sceneNarrations
    .map((n) => n.trim())
    .filter(Boolean)
    .join(' ... ');
}
