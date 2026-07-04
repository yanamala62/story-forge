import { Router, type Request, type Response } from 'express';
import { AnalyticsPipelineService } from '../services/analytics-pipeline.service.js';
import type { ApiResponse } from '@storyforge/shared';

const router = Router();

/**
 * @swagger
 * /api/episodes/{id}/analytics:
 *   get:
 *     summary: Get analytics history for an episode
 *     description: Returns the latest YouTube stats snapshot and full history of collected snapshots.
 *     tags: [Analytics]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Analytics data (null if no YouTube upload exists)
 */
router.get('/episodes/:id/analytics', async (req: Request, res: Response) => {
  const data = await AnalyticsPipelineService.getEpisodeAnalytics(req.params['id'] as string);

  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/episodes/{id}/analytics/collect:
 *   post:
 *     summary: Collect fresh analytics from YouTube for an episode
 *     description: |
 *       Calls the YouTube Data API v3 to fetch current view/like/comment counts
 *       and saves a new snapshot in the analytics table.
 *       Requires YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN.
 *     tags: [Analytics]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Freshly collected snapshot
 *       400:
 *         description: YouTube not configured or no published upload found
 */
router.post('/episodes/:id/analytics/collect', async (req: Request, res: Response) => {
  if (!AnalyticsPipelineService.isConfigured()) {
    res.status(400).json({
      success: false,
      error: {
        code: 'NOT_CONFIGURED',
        message:
          'YouTube credentials not set. Add YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, ' +
          'YOUTUBE_REFRESH_TOKEN to .env.',
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    } satisfies ApiResponse);
    return;
  }

  const result = await AnalyticsPipelineService.collectForEpisode(req.params['id'] as string);

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/analytics/collect-all:
 *   post:
 *     summary: Collect analytics for all published episodes (batch)
 *     description: Fetches stats for all PUBLISHED YouTube uploads in one batch API call.
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: Batch collection summary
 */
router.post('/analytics/collect-all', async (req: Request, res: Response) => {
  if (!AnalyticsPipelineService.isConfigured()) {
    res.status(400).json({
      success: false,
      error: { code: 'NOT_CONFIGURED', message: 'YouTube credentials not configured.' },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    } satisfies ApiResponse);
    return;
  }

  const result = await AnalyticsPipelineService.collectForAllPublished();

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/analytics/summary:
 *   get:
 *     summary: Aggregate analytics totals across all episodes
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: Totals for views, likes, comments, snapshot count
 */
router.get('/analytics/summary', async (req: Request, res: Response) => {
  const summary = await AnalyticsPipelineService.getAggregateSummary();

  res.json({
    success: true,
    data: summary,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

export { router as analyticsRouter };
