import { execFile } from 'child_process';
import { promisify } from 'util';
import { ExternalServiceError } from '@storyforge/shared';

const execFileAsync = promisify(execFile);

export interface LocalVideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

interface FfprobeStream {
  codec_type: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  duration?: string;
}

interface FfprobeFormat {
  duration?: string;
}

interface FfprobeOutput {
  streams: FfprobeStream[];
  format: FfprobeFormat;
}

function parseFrameRate(rate: string | undefined): number {
  if (!rate) return 0;
  const [num, den] = rate.split('/').map(Number);
  if (!num || !den) return 0;
  return Math.round(num / den);
}

/**
 * Probes the LOCAL downloaded file — the source of truth for splitting, per
 * spec (yt-dlp's self-reported duration is a hint only). A single ffprobe
 * call gets both stream-level (width/height/fps/audio-presence) and
 * container-level (duration) data.
 */
export async function probeVideoMetadata(ffprobePath: string, filePath: string): Promise<LocalVideoMetadata> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      ffprobePath,
      ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', filePath],
      { timeout: 60_000, maxBuffer: 20 * 1024 * 1024 },
    ));
  } catch (error) {
    throw new ExternalServiceError(
      'ffprobe',
      `Failed to probe source video: ${error instanceof Error ? error.message : String(error)}`,
      { filePath },
    );
  }

  let data: FfprobeOutput;
  try {
    data = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    throw new ExternalServiceError('ffprobe', 'Could not parse ffprobe JSON output', { filePath });
  }

  const videoStream = data.streams.find((s) => s.codec_type === 'video');
  const audioStream = data.streams.find((s) => s.codec_type === 'audio');

  const durationSeconds = parseFloat(data.format.duration ?? videoStream?.duration ?? '0');

  if (!videoStream || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new ExternalServiceError('ffprobe', 'Source video has no usable video stream or duration', { filePath });
  }

  return {
    durationSeconds,
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    fps: parseFrameRate(videoStream.avg_frame_rate ?? videoStream.r_frame_rate),
    hasAudio: !!audioStream,
  };
}
