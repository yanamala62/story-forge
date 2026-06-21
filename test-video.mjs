import { composeVideo } from './services/video-agent/dist/providers/ffmpeg.provider.js';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const base = 'D:/project/StoryForge AI/apps/api/generated';
const ep = '3798f602-d4f3-4807-848e-e612989e032d';
const images = [1,2,3,4,5,6].map(n => `${base}/images/${ep}/scene-0${n}.png`);

const result = await composeVideo(ffmpegStatic, ffprobeStatic.path, {
  imagePaths: images,
  audioPath: `${base}/audio/${ep}/narration.mp3`,
  subtitlePath: `${base}/subtitles/${ep}/subtitles.srt`,
  outputPath: `${base}/video/${ep}/episode_test.mp4`,
});
console.log('RESULT:', JSON.stringify(result, null, 2));
