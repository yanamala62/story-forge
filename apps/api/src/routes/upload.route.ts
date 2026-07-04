import { Router, type Request, type Response } from 'express';
import { UploadPipelineService } from '../services/upload-pipeline.service.js';
import type { ApiResponse } from '@storyforge/shared';

const router = Router();

/**
 * @swagger
 * /api/episodes/{id}/upload/youtube:
 *   post:
 *     summary: Upload the episode video to YouTube Shorts
 *     description: |
 *       Uploads the composed MP4 to YouTube Shorts using the YouTube Data API v3.
 *       Requires M5 (video) and M6 (SEO) to be complete first.
 *       Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN in .env.
 *       Run `node scripts/youtube-auth.mjs` once to get the refresh token.
 *     tags: [Upload]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               privacyStatus:
 *                 type: string
 *                 enum: [public, private, unlisted]
 *                 default: private
 *                 description: "Use 'private' for testing, 'public' for production"
 *     responses:
 *       201:
 *         description: Uploaded successfully
 *       400:
 *         description: Missing prerequisites or YouTube not configured
 */
router.post('/episodes/:id/upload/youtube', async (req: Request, res: Response) => {
  if (!UploadPipelineService.isYouTubeConfigured()) {
    res.status(400).json({
      success: false,
      error: {
        code: 'NOT_CONFIGURED',
        message:
          'YouTube credentials not set. Add YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, ' +
          'YOUTUBE_REFRESH_TOKEN to .env. Run `node scripts/youtube-auth.mjs` to get the refresh token.',
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    } satisfies ApiResponse);
    return;
  }

  const privacyStatus = req.body?.privacyStatus as 'public' | 'private' | 'unlisted' | undefined;

  const result = await UploadPipelineService.uploadToYouTube(
    req.params['id'] as string,
    privacyStatus ? { privacyStatus } : {},
  );

  res.status(201).json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/episodes/{id}/uploads:
 *   get:
 *     summary: Get all upload records for an episode
 *     tags: [Upload]
 */
router.get('/episodes/:id/uploads', async (req: Request, res: Response) => {
  const uploads = await UploadPipelineService.getEpisodeUploads(req.params['id'] as string);

  res.json({
    success: true,
    data: uploads,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

export { router as uploadRouter };
