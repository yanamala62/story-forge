import { Router, type Request, type Response } from 'express';
import { SubtitlePipelineService } from '../services/subtitle-pipeline.service.js';
import type { ApiResponse } from '@storyforge/shared';

const router = Router();

/**
 * @swagger
 * /api/episodes/{id}/subtitles:
 *   post:
 *     summary: Generate SRT subtitles for an episode using Whisper
 *     description: Transcribes the narration audio and creates a timestamped SRT file. First run downloads Whisper model (~145MB).
 *     tags: [Subtitles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Subtitles generated
 *       400:
 *         description: No narration audio found
 *       404:
 *         description: Episode not found
 */
router.post('/episodes/:id/subtitles', async (req: Request, res: Response) => {
  const result = await SubtitlePipelineService.generateSubtitlesForEpisode(req.params['id'] as string);

  res.status(201).json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/episodes/{id}/subtitles:
 *   get:
 *     summary: Get subtitle file info for an episode
 *     tags: [Subtitles]
 */
router.get('/episodes/:id/subtitles', async (req: Request, res: Response) => {
  const subtitle = await SubtitlePipelineService.getEpisodeSubtitles(req.params['id'] as string);

  res.json({
    success: true,
    data: subtitle,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

export { router as subtitlesRouter };
