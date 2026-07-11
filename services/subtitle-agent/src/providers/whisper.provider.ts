import { createLogger, StorageError, withRetry } from '@storyforge/shared';
import { mkdir, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const logger = createLogger('whisper-provider');

const WHISPER_SCRIPT = join(__dirname, '..', '..', 'scripts', 'whisper_transcribe.py');

export interface WhisperRequest {
  audioPath: string;
  outputSrtPath: string;
  modelSize?: string;
  language?: string;
  /**
   * Optional callback invoked in real-time for each non-empty line of output
   * from the Whisper subprocess. Used by the subtitle pipeline to forward
   * progress to the UI log bus without creating a cross-package dependency.
   */
  onProgress?: (level: 'info' | 'warn', message: string) => void;
}

export interface WhisperResult {
  srtPath: string;
  entryCount: number;
  sizeBytes: number;
}

export async function transcribeWithWhisper(request: WhisperRequest): Promise<WhisperResult> {
  const { audioPath, outputSrtPath, modelSize = 'base', language = 'en', onProgress } = request;

  await mkdir(dirname(outputSrtPath), { recursive: true });

  // For English-only model suffixes (tiny.en, base.en, etc.) used with non-English
  // audio: automatically promote to the multilingual variant so Whisper can
  // actually transcribe the language. .en models are English-only by design.
  const effectiveModel =
    language !== 'en' && modelSize.endsWith('.en')
      ? modelSize.replace(/\.en$/, '')
      : modelSize;

  logger.info('Starting Whisper transcription', { audioPath, outputSrtPath, modelSize: effectiveModel, language });

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  onProgress?.('info', `Model: ${effectiveModel}  Language: ${language}  File: ${audioPath.split('/').pop()}`);

  let entryCount = 0;

  await withRetry(
    async () => {
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const proc = spawn(pythonCmd, [WHISPER_SCRIPT, audioPath, outputSrtPath, effectiveModel, language], {
          timeout: 600_000, // 10 min for multilingual models on CPU
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          stdout += text;
          // Stream each non-empty line to the caller's progress callback in real-time
          for (const rawLine of text.split('\n')) {
            const trimmed = rawLine.trim();
            if (trimmed) {
              process.stdout.write(`[whisper] ${trimmed}\n`);
              onProgress?.('info', trimmed);
            }
          }
        });

        proc.stderr.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          stderr += text;
          // Filter ONNX runtime GPU probe noise — this always appears on CPU-only
          // hosts (Render free tier) because faster-whisper probes /sys/class/drm
          // for GPU devices on startup. It's not an error.
          for (const rawLine of text.split('\n')) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;
            const isOnnxNoise =
              trimmed.includes('W:onnxruntime') ||
              trimmed.includes('GetGpuDevices') ||
              trimmed.includes('device_discovery') ||
              trimmed.includes('ReadFileContents') ||
              trimmed.includes('/sys/class/drm');
            if (isOnnxNoise) {
              // Only log at debug level — don't alarm users with GPU probe messages
              logger.debug('Whisper ONNX GPU probe noise (expected on CPU)', { line: trimmed });
            } else {
              process.stderr.write(`[whisper:err] ${trimmed}\n`);
              onProgress?.('warn', trimmed);
            }
          }
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve({ stdout, stderr });
          } else {
            reject(new StorageError(`Whisper process exited with code ${code}: ${stderr || stdout}`));
          }
        });

        proc.on('error', (err) => reject(new StorageError(`Failed to spawn whisper process: ${err.message}`)));
      });

      const lines = result.stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1] ?? '';

      if (!lastLine.startsWith('OK:')) {
        throw new StorageError(`Whisper did not produce an OK line. Last output: ${lastLine || '(empty)'}`);
      }

      // Format: OK:<path>:<count>:<filesize>
      // Windows paths contain colons (C:\...) — parse from the right
      const tokens = lastLine.split(':');
      const count = parseInt(tokens[tokens.length - 2] ?? '0', 10);
      entryCount = isNaN(count) ? 0 : count;

      onProgress?.('info', `Transcription complete — ${entryCount} subtitle entries written`);
      logger.debug('Whisper stdout parsed', { entryCount });
    },
    {
      maxAttempts: 2,
      initialDelayMs: 3000,
      maxDelayMs: 10000,
      onRetry: (err, attempt) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('Retrying Whisper transcription', { attempt, error: msg });
        onProgress?.('warn', `Retry ${attempt}/2: ${msg}`);
      },
    },
  );

  // Verify output file was actually written
  let sizeBytes = 0;
  try {
    const fileStat = await stat(outputSrtPath);
    sizeBytes = fileStat.size;
  } catch {
    throw new StorageError(`SRT file was not created at: ${outputSrtPath}`);
  }

  logger.info('Whisper transcription complete', { outputSrtPath, entryCount, sizeBytes });

  return { srtPath: outputSrtPath, entryCount, sizeBytes };
}
