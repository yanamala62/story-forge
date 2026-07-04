import { Router, type Request, type Response } from 'express';
import { SchedulerService } from '../services/scheduler.service.js';
import { ValidationError } from '@storyforge/shared';
import type { ApiResponse } from '@storyforge/shared';

const router = Router();

/**
 * @swagger
 * /api/scheduler/status:
 *   get:
 *     summary: Get manual trigger history
 *     description: Returns when the pipeline was last manually triggered and how many times in total.
 *     tags: [Scheduler]
 *     responses:
 *       200:
 *         description: Trigger history
 */
router.get('/scheduler/status', async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: { scheduler: SchedulerService.getStatus() },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/scheduler/trigger-next:
 *   post:
 *     summary: Trigger the next episode's pipeline for a single story
 *     description: |
 *       Resolves the episode to run for the given story — retries the latest FAILED
 *       episode if there is one (resuming from checkpoint), otherwise creates the next
 *       episode — then starts the full pipeline directly in-process. Returns immediately
 *       with the episodeId; poll GET /episodes/:id/pipeline/status and subscribe to
 *       GET /episodes/:id/pipeline/logs/stream for live progress.
 *     tags: [Scheduler]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storyId]
 *             properties:
 *               storyId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pipeline started — returns episodeId
 *       404:
 *         description: Story not found
 *       409:
 *         description: An episode for this story is already in-flight
 */
router.post('/scheduler/trigger-next', async (req: Request, res: Response) => {
  const storyId = req.body?.storyId as string | undefined;
  if (!storyId) throw new ValidationError('storyId is required');

  const result = await SchedulerService.triggerNextEpisodeForStory(storyId);

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

export { router as schedulerRouter };
