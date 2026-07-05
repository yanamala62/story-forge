import { Router, type Request, type Response } from 'express';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service.js';
import { PipelineLogBus } from '../services/pipeline-log-bus.js';
import type { ApiResponse } from '@storyforge/shared';

const router = Router();

/**
 * @swagger
 * /api/episodes/{id}/pipeline/run:
 *   post:
 *     summary: Run (or resume) the full pipeline for an episode
 *     description: |
 *       Starts the pipeline from the last successful checkpoint. Idempotent — each
 *       step checks the DB before running, so already-completed steps are skipped.
 *
 *       Resilience rules:
 *         - RATE_LIMIT errors (429): waits 65 s then retries (up to 3×)
 *         - RETRYABLE errors (network, 5xx): waits 15 s then retries (up to 3×)
 *         - FATAL errors (401/403, bad key): marks episode FAILED immediately
 *
 *       The pipeline runs in the background. This endpoint returns 202 Accepted
 *       immediately. Poll GET /pipeline/status for progress.
 *     tags: [Pipeline]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Episode ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               uploadToYoutube:
 *                 type: boolean
 *                 default: false
 *                 description: |
 *                   If true, M7 (YouTube upload) is included in the run.
 *                   Requires YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET,
 *                   YOUTUBE_REFRESH_TOKEN in .env.
 *     responses:
 *       202:
 *         description: Pipeline started in background
 *       409:
 *         description: Pipeline already running for this episode
 */
router.post('/episodes/:id/pipeline/run', async (req: Request, res: Response) => {
  const episodeId = req.params['id'] as string;
  const uploadToYoutube = req.body?.uploadToYoutube === true;

  if (PipelineOrchestratorService.isRunning(episodeId)) {
    res.status(409).json({
      success: false,
      error: {
        code: 'PIPELINE_ALREADY_RUNNING',
        message: `Pipeline is already running for episode ${episodeId}. Poll GET /api/episodes/${episodeId}/pipeline/status for progress.`,
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    } satisfies ApiResponse);
    return;
  }

  PipelineOrchestratorService.startInBackground(episodeId, { uploadToYoutube });

  res.status(202).json({
    success: true,
    data: {
      episodeId,
      message: 'Pipeline started in background. Poll /pipeline/status for progress.',
      uploadToYoutube,
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/episodes/{id}/pipeline/run/sync:
 *   post:
 *     summary: Run the pipeline synchronously and wait for completion
 *     description: |
 *       Same as POST /pipeline/run but waits for the pipeline to finish before
 *       responding. Useful for testing and scripts. Long-running — may take 3–10 min.
 *     tags: [Pipeline]
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
 *               uploadToYoutube:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Pipeline completed — result contains per-step details
 *       409:
 *         description: Pipeline already running for this episode
 *       500:
 *         description: Pipeline failed — episode marked FAILED in DB
 */
router.post('/episodes/:id/pipeline/run/sync', async (req: Request, res: Response) => {
  const episodeId = req.params['id'] as string;
  const uploadToYoutube = req.body?.uploadToYoutube === true;

  if (PipelineOrchestratorService.isRunning(episodeId)) {
    res.status(409).json({
      success: false,
      error: {
        code: 'PIPELINE_ALREADY_RUNNING',
        message: `Pipeline is already running for episode ${episodeId}.`,
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    } satisfies ApiResponse);
    return;
  }

  const result = await PipelineOrchestratorService.run(episodeId, { uploadToYoutube });

  res.status(result.success ? 200 : 500).json({
    success: result.success,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/episodes/{id}/pipeline/cancel:
 *   post:
 *     summary: Cancel a running pipeline
 *     description: |
 *       Cooperative cancellation — takes effect at the next step boundary (M1..M7),
 *       not mid-step, so an in-flight ffmpeg render or LLM call is not interrupted.
 *       The episode is marked FAILED with "Cancelled by user"; POST /pipeline/run
 *       resumes it from the last completed checkpoint, same as retrying a failure.
 *     tags: [Pipeline]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Whether cancellation was requested (false if nothing was running)
 */
router.post('/episodes/:id/pipeline/cancel', async (req: Request, res: Response) => {
  const episodeId = req.params['id'] as string;
  const cancelled = PipelineOrchestratorService.cancel(episodeId);

  res.json({
    success: true,
    data: { episodeId, cancelled },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/episodes/{id}/pipeline/status:
 *   get:
 *     summary: Get the pipeline status for an episode
 *     description: |
 *       Returns the current EpisodeStatus from DB, which completed steps have
 *       DB records, which are still pending, and all upload records.
 *     tags: [Pipeline]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Pipeline status
 */
router.get('/episodes/:id/pipeline/status', async (req: Request, res: Response) => {
  const episodeId = req.params['id'] as string;

  const status = await PipelineOrchestratorService.getStatus(episodeId);
  const isRunning = PipelineOrchestratorService.isRunning(episodeId);

  // When the pipeline is live, mark the first pending step as 'running' so the
  // frontend dot turns blue immediately — without waiting for the episode status
  // enum to change (which happens after the step completes).
  if (isRunning) {
    const firstPending = status.steps.find((s) => s.status === 'pending');
    if (firstPending) firstPending.status = 'running';
  }

  res.json({
    success: true,
    data: {
      ...status,
      isRunning,
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/episodes/{id}/pipeline/logs/stream:
 *   get:
 *     summary: Live pipeline log stream (Server-Sent Events)
 *     description: |
 *       Streams pipeline log lines for an episode as they happen. Sends the buffered
 *       backlog immediately on connect, then pushes new entries as `data: <json>\n\n`.
 *     tags: [Pipeline]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: text/event-stream of PipelineLogEntry objects
 */
router.get('/episodes/:id/pipeline/logs/stream', (req: Request, res: Response) => {
  const episodeId = req.params['id'] as string;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  for (const entry of PipelineLogBus.getBuffer(episodeId)) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  const unsubscribe = PipelineLogBus.subscribe(episodeId, (entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });

  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

export { router as pipelineRouter };
