import { Router, type Request, type Response } from 'express';
import { ImagePipelineService } from '../services/image-pipeline.service.js';
import type { ApiResponse } from '@storyforge/shared';

const router = Router();

/**
 * @swagger
 * /api/episodes/{id}/images:
 *   post:
 *     summary: Generate images for all scenes in an episode
 *     description: Runs Prompt Agent then Image Agent (Pollinations.ai). Takes 2-5 minutes for 6 scenes.
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: All images generated
 *       404:
 *         description: Episode not found
 */
router.post('/episodes/:id/images', async (req: Request, res: Response) => {
  const result = await ImagePipelineService.generateImagesForEpisode(req.params['id'] as string);

  res.status(201).json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/episodes/{id}/images:
 *   get:
 *     summary: Get all generated images for an episode
 *     tags: [Images]
 */
router.get('/episodes/:id/images', async (req: Request, res: Response) => {
  const images = await ImagePipelineService.getEpisodeImages(req.params['id'] as string);

  res.json({
    success: true,
    data: images,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

export { router as imagesRouter };
