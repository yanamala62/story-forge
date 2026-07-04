import { createLogger, StorageError, withRetry } from '@storyforge/shared';
import { mkdir, writeFile, unlink, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const logger = createLogger('edge-tts-provider');

export const EDGE_TTS_VOICES = {
  // English
  'en-US-JennyNeural': 'Jenny (Female, US, warm & natural)',
  'en-US-GuyNeural': 'Guy (Male, US, confident)',
  'en-US-AriaNeural': 'Aria (Female, US, newscast)',
  'en-US-DavisNeural': 'Davis (Male, US, casual)',
  'en-US-NancyNeural': 'Nancy (Female, US, pleasant)',
  'en-GB-SoniaNeural': 'Sonia (Female, UK, clear)',
  'en-AU-NatashaNeural': 'Natasha (Female, AU, friendly)',
  // Hindi
  'hi-IN-SwaraNeural': 'Swara (Female, Hindi, natural)',
  'hi-IN-MadhurNeural': 'Madhur (Male, Hindi, clear)',
  // Telugu
  'te-IN-ShrutiNeural': 'Shruti (Female, Telugu, natural)',
  'te-IN-MohanNeural': 'Mohan (Male, Telugu, clear)',
} as const;

export type EdgeTTSVoice = keyof typeof EDGE_TTS_VOICES;

// Default voice per language code
export const LANGUAGE_DEFAULT_VOICE: Record<string, EdgeTTSVoice> = {
  EN: 'en-US-JennyNeural',
  HI: 'hi-IN-SwaraNeural',
  TE: 'te-IN-ShrutiNeural',
};

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

const TTS_SCRIPT = join(__dirname, '..', '..', 'scripts', 'tts.py');

export async function generateNarrationWithEdgeTTS(
  request: EdgeTTSRequest,
): Promise<EdgeTTSResult> {
  const { text, outputPath, voice = 'en-US-JennyNeural' } = request;

  await mkdir(dirname(outputPath), { recursive: true });

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

  let fileSize = 0;
  try {
    const fileStat = await stat(outputPath);
    fileSize = fileStat.size;
  } catch {
    throw new StorageError(`Audio file was not created at ${outputPath}`);
  }

  logger.info('Narration audio generated', { outputPath, sizeBytes: fileSize, voice });

  // Estimate duration — Hindi/Telugu speech is slightly slower (~1.8 words/sec)
  const wordCount = text.trim().split(/\s+/).length;
  const wordsPerSecond = voice.startsWith('en-') ? 2.3 : 1.8;
  const duration = Math.ceil(wordCount / wordsPerSecond);

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
