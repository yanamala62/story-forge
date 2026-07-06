import { Router, type Request, type Response } from 'express';
import { StoryService } from '../services/story.service.js';
import type { ApiResponse } from '@storyforge/shared';

const router = Router();

/**
 * @swagger
 * /api/episodes/{id}:
 *   get:
 *     summary: Get episode by ID (with scenes)
 *     tags: [Episodes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Episode with all scenes
 *       404:
 *         description: Episode not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  const episode = await StoryService.getEpisode(req.params['id'] as string);

  res.json({
    success: true,
    data: episode,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/episodes/agent/health:
 *   get:
 *     summary: Check Story Agent and OpenRouter health
 *     tags: [Episodes, Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Agent health status
 */
router.get('/agent/health', async (req: Request, res: Response) => {
  const health = await StoryService.getAgentHealth();

  res.json({
    success: true,
    data: health,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

export { router as episodesRouter };
