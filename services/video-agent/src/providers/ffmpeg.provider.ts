import { createLogger } from '@storyforge/shared';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, copyFile, stat, writeFile, rm } from 'fs/promises';
import { dirname, join } from 'path';

const execFileAsync = promisify(execFile);
const logger = createLogger('ffmpeg-provider');

export interface ComposeVideoInput {
  imagePaths: string[];
  audioPath: string;
  subtitlePath: string;
  outputPath: string;
  width?: number;
  height?: number;
  fps?: number;
  crf?: number;
  codec?: string;
  onProgress?: (done: number, total: number, phase: 'clip' | 'compose') => void;
}

export interface ComposeVideoResult {
  outputPath: string;
  duration: number;
  fileSize: number;
}

interface KenBurns {
  x: string;
  y: string;
}

// Six focal points for the zoom-in. The zoom amount itself is identical per
// scene (smooth 1.0 → 1.5); only the anchor point changes for visual variety.
const FOCAL_POINTS: KenBurns[] = [
  { x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' }, // center
  { x: '0', y: '0' }, // top-left
  { x: 'iw-iw/zoom', y: '0' }, // top-right
  { x: '0', y: 'ih-ih/zoom' }, // bottom-left
  { x: 'iw-iw/zoom', y: 'ih-ih/zoom' }, // bottom-right
  { x: 'iw/2-(iw/zoom/2)', y: '0' }, // top-center
];

export async function probeAudioDuration(ffprobePath: string, audioPath: string): Promise<number> {
  const { stdout } = await execFileAsync(
    ffprobePath,
    ['-v', 'quiet', '-print_format', 'json', '-show_streams', audioPath],
    { timeout: 30_000 },
  );

  const data = JSON.parse(stdout) as {
    streams: Array<{ duration?: string; codec_type: string }>;
  };
  const audioStream = data.streams.find((s) => s.codec_type === 'audio');

  if (!audioStream?.duration) {
    throw new Error('Could not determine audio duration from ffprobe output');
  }

  return parseFloat(audioStream.duration);
}

export async function generateThumbnail(
  ffmpegPath: string,
  videoPath: string,
  thumbnailPath: string,
): Promise<string> {
  await mkdir(dirname(thumbnailPath), { recursive: true });
  await execFileAsync(
    ffmpegPath,
    ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '2', '-i', videoPath, '-vframes', '1', '-q:v', '2', thumbnailPath],
    { timeout: 30_000 },
  );
  return thumbnailPath;
}

/**
 * Render a single still image into a short MP4 clip with a Ken Burns zoom-in.
 *
 * Why a separate clip per scene: zoompan emits `d` frames PER INPUT FRAME.
 * Feeding it a multi-image stream makes it lock onto the first frame and emit
 * the entire video from one image. Rendering each image in isolation — with
 * `-loop 1 -t <dur>` so the input is exactly one scene long — sidesteps that
 * entirely. The clips are then concatenated.
 */
async function renderSceneClip(
  ffmpegPath: string,
  imagePath: string,
  clipOutPath: string,
  durationSec: number,
  focal: KenBurns,
  opts: { width: number; height: number; fps: number; crf: number; codec: string },
): Promise<void> {
  const { width, height, fps, crf, codec } = opts;
  const frames = Math.max(fps, Math.round(durationSec * fps));
  // Smooth zoom 1.0 → 1.5 across the clip. zoom is the accumulator (prev frame's
  // value); incrementing per frame avoids the invalid `n`/`in` variables.
  const inc = (0.5 / frames).toFixed(6);
  const zExpr = `min(zoom+${inc},1.5)`;

  const vf =
    `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
    `crop=${width}:${height},` +
    `zoompan=z='${zExpr}':x='${focal.x}':y='${focal.y}':` +
    `d=${frames}:s=${width}x${height}:fps=${fps},` +
    `setsar=1`;

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-loop', '1',
    '-i', imagePath,
    '-t', durationSec.toFixed(3),
    '-vf', vf,
    '-c:v', codec,
    '-preset', 'veryfast',
    '-threads', '2',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    clipOutPath,
  ];

  // maxBuffer is a defensive ceiling on top of -loglevel error (which already
  // cuts stderr volume to near-zero in the success case) — a real ffmpeg error
  // dump should never approach even a fraction of this.
  await execFileAsync(ffmpegPath, args, { timeout: 300_000, maxBuffer: 20 * 1024 * 1024 });
}

export async function composeVideo(
  ffmpegPath: string,
  ffprobePath: string,
  input: ComposeVideoInput,
): Promise<ComposeVideoResult> {
  const {
    imagePaths,
    audioPath,
    subtitlePath,
    outputPath,
    width = 1080,
    height = 1920,
    fps = 30,
    crf = 23,
    codec = 'libx264',
    onProgress,
  } = input;

  if (!imagePaths.length) throw new Error('No images provided for video composition');

  const outputDir = dirname(outputPath);
  await mkdir(outputDir, { recursive: true });

  const audioDuration = await probeAudioDuration(ffprobePath, audioPath);
  const sceneCount = imagePaths.length;
  const durationPerScene = audioDuration / sceneCount;

  logger.info('Composing video', { sceneCount, audioDuration, durationPerScene });

  // ── Pass 1: render each scene to its own clip ──────────────────────────────
  const clipsDir = join(outputDir, 'clips');
  await mkdir(clipsDir, { recursive: true });

  const clipPaths: string[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const clipPath = join(clipsDir, `clip-${String(i + 1).padStart(2, '0')}.mp4`);
    const focal = FOCAL_POINTS[i % FOCAL_POINTS.length]!;
    await renderSceneClip(ffmpegPath, imagePaths[i]!, clipPath, durationPerScene, focal, {
      width,
      height,
      fps,
      crf,
      codec,
    });
    clipPaths.push(clipPath);
    logger.debug('Scene clip rendered', { scene: i + 1, clipPath });
    onProgress?.(i + 1, sceneCount + 1, 'clip');
  }

  onProgress?.(sceneCount, sceneCount + 1, 'compose');

  // ── Pass 2: concat clips + mux audio + burn subtitles ──────────────────────
  // Concat list referencing the rendered clips (all identical params → safe).
  const concatListContent = clipPaths
    .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "\\'")}'`)
    .join('\n');
  const concatListPath = join(outputDir, 'concat_list.txt');
  await writeFile(concatListPath, concatListContent, 'utf8');

  // Copy subtitles to a plain filename so the filter can reference it via cwd.
  const localSubtitleName = 'subtitles_burn.srt';
  await copyFile(subtitlePath, join(outputDir, localSubtitleName));

  const subtitleFilter =
    `subtitles='${localSubtitleName}':` +
    `force_style='FontName=Arial,FontSize=22,Bold=1,` +
    `PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,` +
    `Outline=2,Shadow=1,Alignment=2,MarginV=80'`;

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-i', audioPath,
    '-vf', subtitleFilter,
    '-map', '0:v',
    '-map', '1:a',
    '-c:v', codec,
    '-preset', 'veryfast',
    '-threads', '2',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-shortest',
    outputPath,
  ];

  logger.info('Stitching clips + audio + subtitles', { outputPath });

  // Root cause of the recurring "stderr maxBuffer length exceeded" production
  // failure: ffmpeg's default verbosity writes continuous per-frame stats to
  // stderr, which crosses Node's default ~1MB execFile buffer partway through
  // a full-length composite. -loglevel error eliminates that noise at the
  // source; maxBuffer is raised as a defensive ceiling on top of that.
  const { stderr } = await execFileAsync(ffmpegPath, args, {
    timeout: 600_000,
    cwd: outputDir,
    maxBuffer: 20 * 1024 * 1024,
  });

  if (stderr) {
    logger.debug('FFmpeg stderr', { stderr: stderr.slice(-800) });
  }

  // Clean up intermediate clips
  await rm(clipsDir, { recursive: true, force: true }).catch(() => undefined);

  const fileStat = await stat(outputPath);

  logger.info('FFmpeg composition complete', {
    outputPath,
    fileSize: fileStat.size,
    duration: audioDuration,
  });

  return { outputPath, duration: audioDuration, fileSize: fileStat.size };
}
