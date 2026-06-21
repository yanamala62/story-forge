import { Router, type Request, type Response } from 'express';
import { VideoPipelineService } from '../services/video-pipeline.service.js';
import type { ApiResponse } from '@storyforge/shared';

const router = Router();

/**
 * @swagger
 * /api/episodes/{id}/video:
 *   post:
 *     summary: Compose the final MP4 video for an episode
 *     description: |
 *       Uses FFmpeg to combine scene images (with Ken Burns zoom/pan effects),
 *       narration audio, and burned-in SRT subtitles into a 1080×1920 9:16 MP4.
 *       Requires M2 (images), M3 (narration), and M4 (subtitles) to be complete first.
 *     tags: [Video]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Video composed successfully
 *       400:
 *         description: Missing prerequisite (images / audio / subtitles)
 *       404:
 *         description: Episode not found
 */
router.post('/episodes/:id/video', async (req: Request, res: Response) => {
  const result = await VideoPipelineService.composeVideoForEpisode(req.params['id'] as string);

  res.status(201).json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/episodes/{id}/video:
 *   get:
 *     summary: Get video info for an episode
 *     tags: [Video]
 */
router.get('/episodes/:id/video', async (req: Request, res: Response) => {
  const video = await VideoPipelineService.getEpisodeVideo(req.params['id'] as string);

  res.json({
    success: true,
    data: video,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

export { router as videoRouter };
