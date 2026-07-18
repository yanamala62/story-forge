// Resume the existing Clip Forge project (idempotent: skips parts that already
// have a youtubeVideoId). Same binary/storage overrides as the initial run.
const path = require('path');
const FF = 'C:/Users/lenovo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin';
process.env.YTDLP_BINARY_PATH = 'C:/Users/lenovo/AppData/Roaming/Python/Python310/Scripts/yt-dlp.exe';
process.env.FFMPEG_BINARY_PATH = `${FF}/ffmpeg.exe`;
process.env.FFPROBE_BINARY_PATH = `${FF}/ffprobe.exe`;
process.env.STORAGE_TYPE = 'local';
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const PROJECT_ID = process.argv[2] || 'a4ba292c-660b-4307-abd0-b4deadac3545';

async function main() {
  const { ClipForgeOrchestratorService } = require('@storyforge/clip-forge-orchestrator');
  const { disconnectDatabase } = require('@storyforge/database');
  console.log(`Resuming project ${PROJECT_ID} (uploads only the parts still missing a youtubeVideoId)...`);
  const result = await ClipForgeOrchestratorService.run(PROJECT_ID);
  console.log('\n=== RUN RESULT ===', JSON.stringify(result, null, 2));
  const status = await ClipForgeOrchestratorService.getStatus(PROJECT_ID);
  console.log(`\nUploaded ${status.uploadedCount}/${status.parts.length}. Project status: ${status.project.status}`);
  for (const p of status.parts.sort((a, b) => a.partNumber - b.partNumber)) {
    console.log(p.youtubeVideoId
      ? `  ${p.partLabel}: ${p.status} -> https://www.youtube.com/shorts/${p.youtubeVideoId}`
      : `  ${p.partLabel}: ${p.status}${p.lastUploadError ? '  (err: ' + p.lastUploadError.slice(0, 120) + ')' : ''}`);
  }
  await disconnectDatabase();
}
main().catch(async (err) => {
  console.error('\n=== FAILED ===\n', err);
  try { require('@storyforge/database').disconnectDatabase(); } catch {}
  process.exit(1);
});
