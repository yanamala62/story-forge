import { Router, type Request, type Response } from 'express';
import { SeoPipelineService } from '../services/seo-pipeline.service.js';
import type { ApiResponse } from '@storyforge/shared';

const router = Router();

/**
 * @swagger
 * /api/episodes/{id}/seo:
 *   post:
 *     summary: Generate SEO metadata for an episode video
 *     description: |
 *       Uses OpenRouter LLM to generate YouTube/Instagram/TikTok-optimized title,
 *       description, tags, and hashtags. Requires video to be composed first (M5).
 *     tags: [SEO]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: SEO metadata generated
 *       400:
 *         description: Video not found — compose video first
 *       404:
 *         description: Episode not found
 */
router.post('/episodes/:id/seo', async (req: Request, res: Response) => {
  const result = await SeoPipelineService.generateSeoForEpisode(req.params['id'] as string);

  res.status(201).json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/episodes/{id}/seo:
 *   get:
 *     summary: Get SEO metadata for an episode
 *     tags: [SEO]
 */
router.get('/episodes/:id/seo', async (req: Request, res: Response) => {
  const seo = await SeoPipelineService.getEpisodeSeo(req.params['id'] as string);

  res.json({
    success: true,
    data: seo,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

export { router as seoRouter };
