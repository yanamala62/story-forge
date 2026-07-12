import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, stat } from 'fs/promises';
import { dirname } from 'path';
import { FFmpegError } from '@storyforge/shared';

const execFileAsync = promisify(execFile);

export interface RenderClipForgePartInput {
  sourceVideoPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  width: number;
  height: number;
  hasAudio: boolean;
  fps?: number;
  crf?: number;
  codec?: string;
}

export interface RenderClipForgePartResult {
  outputPath: string;
  duration: number;
  fileSize: number;
}

/**
 * Renders one continuous [startTime, endTime) slice of the source video into
 * a vertical 9:16 Short using the FIT_WITH_BLURRED_BACKGROUND strategy:
 *   - a blurred, cropped-to-fill background (full canvas coverage)
 *   - the COMPLETE original frame scaled to fit, centered on top — never
 *     cropped, so no source content is lost
 *
 * No subtitles, no captions, no drawtext, no part-number overlay — the
 * output must contain only the original video content reformatted, per spec.
 * Original audio is passed through as-is (re-encoded to AAC only because the
 * segment cut requires re-encoding for a clean boundary — never normalized,
 * never replaced).
 *
 * Uses execFile with an argument ARRAY — never a shell string — so
 * `sourceVideoPath`/`outputPath` (which can contain arbitrary characters from
 * a downloaded video title's derived path) can never be interpreted as shell
 * syntax.
 */
export async function renderClipForgePart(
  ffmpegPath: string,
  input: RenderClipForgePartInput,
): Promise<RenderClipForgePartResult> {
  const {
    sourceVideoPath,
    outputPath,
    startTime,
    endTime,
    width,
    height,
    hasAudio,
    fps = 30,
    crf = 23,
    codec = 'libx264',
  } = input;

  const duration = endTime - startTime;
  if (duration <= 0) {
    throw new FFmpegError(`Invalid clip range: startTime=${startTime} must be before endTime=${endTime}`);
  }

  await mkdir(dirname(outputPath), { recursive: true });

  const filterComplex =
    `[0:v]split=2[bg][fg];` +
    `[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=20[bg_blur];` +
    `[fg]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg_scaled];` +
    `[bg_blur][fg_scaled]overlay=(W-w)/2:(H-h)/2:format=auto[outv]`;

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-ss', startTime.toFixed(3),
    '-i', sourceVideoPath,
    '-t', duration.toFixed(3),
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    ...(hasAudio ? ['-map', '0:a?'] : []),
    '-c:v', codec,
    '-preset', 'veryfast',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']),
    '-movflags', '+faststart',
    outputPath,
  ];

  try {
    // maxBuffer defensive ceiling matches the existing ffmpeg.provider.ts
    // pattern — -loglevel error already keeps stderr near-empty on success.
    await execFileAsync(ffmpegPath, args, { timeout: 300_000, maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    throw new FFmpegError(
      `Failed to render Clip Forge part (${startTime}-${endTime}): ${error instanceof Error ? error.message : String(error)}`,
      { sourceVideoPath, outputPath, startTime, endTime },
    );
  }

  const fileStat = await stat(outputPath);

  return { outputPath, duration, fileSize: fileStat.size };
}
