import { createLogger, ExternalServiceError } from '@storyforge/shared';
import { create as createYtDlp } from 'yt-dlp-exec';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

const logger = createLogger('ytdlp-provider');

export interface YtDlpVideoInfo {
  videoId: string;
  title: string;
  /** yt-dlp's self-reported duration in seconds — a HINT ONLY, never authoritative for splitting. */
  durationSeconds: number;
}

/**
 * Fetches metadata without downloading (--dump-single-json / --skip-download).
 * yt-dlp-exec builds the child-process argument array itself (execa under the
 * hood) — the URL and flags are never concatenated into a shell string, so
 * this is safe against command injection even though `url` is user-supplied.
 */
export async function getVideoInfo(binaryPath: string, url: string): Promise<YtDlpVideoInfo> {
  const ytdlp = createYtDlp(binaryPath);

  try {
    const info = await ytdlp(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true,
      skipDownload: true,
    });

    return {
      videoId: info.id,
      title: info.title ?? info.fulltitle ?? 'Untitled video',
      durationSeconds: typeof info.duration === 'number' ? info.duration : 0,
    };
  } catch (error) {
    throw new ExternalServiceError(
      'yt-dlp',
      `Failed to fetch video metadata: ${error instanceof Error ? error.message : String(error)}`,
      { url },
    );
  }
}

/**
 * Downloads the source video to `outputPath`. Bounded to <=1080p to keep
 * download size/time reasonable — Clip Forge re-encodes every part anyway
 * (FIT_WITH_BLURRED_BACKGROUND), so a 4K source buys nothing but slower
 * downloads and more disk usage.
 *
 * No timeout is set on the child process — a multi-hour source video on a
 * slow connection can legitimately take a long time to download, and killing
 * it partway through would corrupt a resumable pipeline run for no benefit.
 */
export async function downloadVideo(binaryPath: string, url: string, outputPath: string): Promise<void> {
  const ytdlp = createYtDlp(binaryPath);
  await mkdir(dirname(outputPath), { recursive: true });

  logger.info('Downloading source video', { outputPath });

  try {
    await ytdlp(url, {
      output: outputPath,
      format: 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/best[ext=mp4]/best',
      mergeOutputFormat: 'mp4',
      noPlaylist: true,
      noWarnings: true,
      noProgress: true,
    });
  } catch (error) {
    throw new ExternalServiceError(
      'yt-dlp',
      `Failed to download source video: ${error instanceof Error ? error.message : String(error)}`,
      { url },
    );
  }

  logger.info('Source video downloaded', { outputPath });
}
