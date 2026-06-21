import { createLogger, StorageError, withRetry } from '@storyforge/shared';
import { mkdir, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const logger = createLogger('whisper-provider');

const WHISPER_SCRIPT = join(__dirname, '..', '..', 'scripts', 'whisper_transcribe.py');

export interface WhisperRequest {
  audioPath: string;
  outputSrtPath: string;
  modelSize?: string;
  language?: string;
}

export interface WhisperResult {
  srtPath: string;
  entryCount: number;
  sizeBytes: number;
}

export async function transcribeWithWhisper(request: WhisperRequest): Promise<WhisperResult> {
  const { audioPath, outputSrtPath, modelSize = 'base.en' } = request;

  await mkdir(dirname(outputSrtPath), { recursive: true });

  logger.info('Starting Whisper transcription', { audioPath, outputSrtPath, modelSize });

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  let capturedStdout = '';
  let entryCount = 0;

  await withRetry(
    async () => {
      const { stdout, stderr } = await execFileAsync(
        pythonCmd,
        [WHISPER_SCRIPT, audioPath, outputSrtPath, modelSize],
        { timeout: 300_000 },
      );

      capturedStdout = stdout;

      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1] ?? '';

      if (!lastLine.startsWith('OK:')) {
        throw new StorageError(`Whisper script failed: ${stderr || stdout}`);
      }

      // Format: OK:<path>:<count>:<filesize>
      // Windows paths contain colons (C:\...) — parse from the right
      // Last token = filesize, second-last = count
      const tokens = lastLine.split(':');
      // tokens: ['OK', 'C', '\\path...', '<count>', '<size>']
      const count = parseInt(tokens[tokens.length - 2] ?? '0', 10);
      entryCount = isNaN(count) ? 0 : count;

      logger.debug('Whisper transcription stdout', { entryCount });
    },
    {
      maxAttempts: 2,
      initialDelayMs: 3000,
      maxDelayMs: 10000,
      onRetry: (err, attempt) => {
        logger.warn('Retrying Whisper transcription', {
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });
      },
    },
  );

  // Verify output file exists
  let sizeBytes = 0;
  try {
    const fileStat = await stat(outputSrtPath);
    sizeBytes = fileStat.size;
  } catch {
    throw new StorageError(`SRT file was not created at ${outputSrtPath}`);
  }

  logger.info('Whisper transcription complete', { outputSrtPath, entryCount, sizeBytes });

  return { srtPath: outputSrtPath, entryCount, sizeBytes };
}
