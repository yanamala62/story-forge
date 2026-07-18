// Throwaway driver: runs the REAL Clip Forge orchestrator (same code path as the
// API's clip-forge route) for one YouTube URL, uploading every part to the
// connected channel as PRIVATE. No API/web server needed. Windows binary paths
// are injected BEFORE dotenv so they win over the .env unix defaults.
const path = require('path');

// Windows-native binaries (the .env values are Linux paths for Docker/Render).
// Set first so dotenv (which does not override existing vars) can't clobber them.
const FF = 'C:/Users/lenovo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin';
process.env.YTDLP_BINARY_PATH = 'C:/Users/lenovo/AppData/Roaming/Python/Python310/Scripts/yt-dlp.exe';
process.env.FFMPEG_BINARY_PATH = `${FF}/ffmpeg.exe`;
process.env.FFPROBE_BINARY_PATH = `${FF}/ffprobe.exe`;
// Force LOCAL storage: the Supabase bucket rejects the ~13-min source video
// ("object exceeded the maximum allowed size"). Local storage keeps files on
// disk and still fully exercises render + YouTube upload.
process.env.STORAGE_TYPE = 'local';

require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const YOUTUBE_URL = process.argv[2] || 'https://youtu.be/PyZ39JmS8o8';
const USER_ID = process.argv[3] || 'clipforge-manual-test-user';

async function main() {
  const { ClipForgeOrchestratorService } = require('@storyforge/clip-forge-orchestrator');
  const { disconnectDatabase } = require('@storyforge/database');

  console.log(`Privacy: ${process.env.CLIP_FORGE_YOUTUBE_PRIVACY} | target ${process.env.CLIP_FORGE_TARGET_DURATION_SECONDS}s`);
  console.log(`Creating project for: ${YOUTUBE_URL}`);

  const project = await ClipForgeOrchestratorService.createProject({ userId: USER_ID, youtubeUrl: YOUTUBE_URL });
  console.log(`Project created: ${project.id} (videoId ${project.sourceVideoId})`);

  console.log('Running full pipeline (ingest -> split -> continuity -> render -> SEO -> upload, per part)...\n');
  const result = await ClipForgeOrchestratorService.run(project.id);

  console.log('\n=== RUN RESULT ===', JSON.stringify(result, null, 2));

  const status = await ClipForgeOrchestratorService.getStatus(project.id);
  console.log(`\nUploaded ${status.uploadedCount}/${status.parts.length} parts. Project status: ${status.project.status}`);
  for (const p of status.parts.sort((a, b) => a.partNumber - b.partNumber)) {
    const line = p.youtubeVideoId
      ? `  ${p.partLabel}: ${p.status}  -> https://www.youtube.com/shorts/${p.youtubeVideoId}`
      : `  ${p.partLabel}: ${p.status}${p.lastUploadError ? '  (err: ' + p.lastUploadError.slice(0, 120) + ')' : ''}`;
    console.log(line);
  }

  await disconnectDatabase();
  console.log(`\nProject id (for resume/inspection): ${project.id}`);
}

main().catch(async (err) => {
  console.error('\n=== FAILED ===\n', err);
  try { require('@storyforge/database').disconnectDatabase(); } catch {}
  process.exit(1);
});
