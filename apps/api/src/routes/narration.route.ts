import { Router, type Request, type Response } from 'express';
import { NarrationPipelineService } from '../services/narration-pipeline.service.js';
import { EDGE_TTS_VOICES } from '@storyforge/narration-agent';
import type { ApiResponse } from '@storyforge/shared';

const router = Router();

/**
 * @swagger
 * /api/episodes/{id}/narration:
 *   post:
 *     summary: Generate narration audio for an episode
 *     description: Combines all scene narrations and converts to MP3 using Microsoft Edge TTS (free)
 *     tags: [Narration]
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
 *               voice:
 *                 type: string
 *                 enum: [en-US-JennyNeural, en-US-GuyNeural, en-US-AriaNeural, en-US-DavisNeural, en-GB-SoniaNeural]
 *                 default: en-US-JennyNeural
 *     responses:
 *       201:
 *         description: Narration audio generated
 */
router.post('/episodes/:id/narration', async (req: Request, res: Response) => {
  const voice = req.body?.voice as string | undefined;

  const result = await NarrationPipelineService.generateNarrationForEpisode(
    req.params['id'] as string,
    voice,
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
 * /api/episodes/{id}/narration:
 *   get:
 *     summary: Get narration audio info for an episode
 *     tags: [Narration]
 */
router.get('/episodes/:id/narration', async (req: Request, res: Response) => {
  const audio = await NarrationPipelineService.getEpisodeAudio(req.params['id'] as string);

  res.json({
    success: true,
    data: audio,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/narration/voices:
 *   get:
 *     summary: List available TTS voices
 *     tags: [Narration]
 *     security: []
 */
router.get('/narration/voices', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: Object.entries(EDGE_TTS_VOICES).map(([id, description]) => ({ id, description })),
    timestamp: new Date().toISOString(),
    requestId: _req.requestId,
  } satisfies ApiResponse);
});

export { router as narrationRouter };
