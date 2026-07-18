// Throwaway e2e test — exercises the REAL hardened pipeline (download, ffprobe,
// split, continuity, FFmpeg render, SEO title) WITHOUT DB writes or YouTube
// upload. Uses the freshly-built dist so it tests the timeout/retry hardening.
import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(process.cwd(), '.env') });

const { VideoSourceAgentService } = await import('./services/video-source-agent/dist/index.js');
const { buildContinuousSplitPlan, validateContinuity } = await import('./services/clip-continuity-agent/dist/index.js');
const { renderClipForgePart } = await import('./services/clip-forge-orchestrator/dist/index.js');
const { SeoAgentService } = await import('./services/seo-agent/dist/index.js');
const { getEnv, ensureLocalFile } = await import('./packages/shared/dist/index.js');
const { rm, stat } = await import('fs/promises');

const YOUTUBE_URL = process.argv[2] || 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // "Me at the zoo", 0:19
const TEST_USER_ID = 'e2e-sample-user';
const TEST_PROJECT_ID = 'e2e-sample-project';

async function main() {
  console.log(`Testing with: ${YOUTUBE_URL}\n`);

  console.log('=== STEP 1: source ingest (real yt-dlp + ffprobe, with new timeouts/retries) ===');
  const t0 = Date.now();
  const ingested = await new VideoSourceAgentService().ingestSource({
    youtubeUrl: YOUTUBE_URL, userId: TEST_USER_ID, projectId: TEST_PROJECT_ID,
  });
  console.log(`Ingested in ${Math.round((Date.now() - t0) / 1000)}s:`, {
    title: ingested.title, duration: ingested.duration, width: ingested.width,
    height: ingested.height, fps: ingested.fps, audioDetected: ingested.audioDetected, s3Key: ingested.s3Key,
  });

  let localPath = ingested.localPath;
  if (ingested.s3Key) { await ensureLocalFile(localPath, ingested.s3Key); }

  console.log('\n=== STEP 2+3: split planning + continuity ===');
  const plan = buildContinuousSplitPlan({ sourceDuration: ingested.duration, targetDurationSeconds: 60 });
  console.log(`Split into ${plan.length} part(s). Last part ends at: ${plan[plan.length - 1].endTime} (source: ${ingested.duration})`);
  const validation = validateContinuity(plan, ingested.duration);
  console.log('Continuity valid:', validation.valid, { missing: validation.missingRanges.length, overlap: validation.overlapRanges.length });
  if (!validation.valid) throw new Error('Continuity failed');

  console.log('\n=== STEP 4: FFmpeg vertical render of Part 001 ===');
  const env = getEnv();
  const ffmpegPath = env.FFMPEG_BINARY_PATH !== 'ffmpeg' ? env.FFMPEG_BINARY_PATH : 'ffmpeg';
  const outputPath = join(process.cwd(), 'generated', 'clip-forge', TEST_USER_ID, TEST_PROJECT_ID, 'rendered', 'part_001.mp4');
  const t1 = Date.now();
  const rendered = await renderClipForgePart(ffmpegPath, {
    sourceVideoPath: localPath, outputPath, startTime: plan[0].startTime, endTime: plan[0].endTime,
    width: env.CLIP_FORGE_WIDTH, height: env.CLIP_FORGE_HEIGHT, hasAudio: ingested.audioDetected,
  });
  const st = await stat(rendered.outputPath);
  console.log(`Rendered in ${Math.round((Date.now() - t1) / 1000)}s -> ${env.CLIP_FORGE_WIDTH}x${env.CLIP_FORGE_HEIGHT} vertical, ${st.size} bytes`);

  console.log('\n=== STEP 5: SEO title (real OpenRouter) ===');
  const titleResult = await new SeoAgentService().generateClipForgeTitle({
    originalVideoTitle: ingested.title, partNumber: 1, totalParts: plan.length, startTime: 0, endTime: plan[0].endTime,
  });
  console.log('Title:', titleResult.title, '| usedFallback:', titleResult.usedFallback, '| has Part 001:', titleResult.title.includes('Part 001'));

  await rm(join(process.cwd(), 'generated', 'clip-forge', TEST_USER_ID), { recursive: true, force: true });
  console.log('\n=== PASS: full flow works (nothing uploaded, nothing left on disk) ===');
}

main().catch((err) => { console.error('\n=== FAILED ===\n', err); process.exit(1); });
