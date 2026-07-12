import { Router, type Request, type Response } from 'express';
import { ClipForgeOrchestratorService } from '@storyforge/clip-forge-orchestrator';
import { ClipForgeProjectRepository, ClipForgePartRepository } from '@storyforge/database';
import { validateContinuity } from '@storyforge/clip-continuity-agent';
import { NotFoundError, ValidationError, ConflictError } from '@storyforge/shared';
import type { ApiResponse } from '@storyforge/shared';

const router = Router();

// Temporary: hardcoded system user until auth is built — same convention as stories.route.ts.
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

const projectRepo = new ClipForgeProjectRepository();
const partRepo = new ClipForgePartRepository();

async function requireOwnedProject(projectId: string, userId: string) {
  const project = await projectRepo.findByIdForUser(projectId, userId);
  if (!project) throw new NotFoundError('ClipForgeProject', projectId);
  return project;
}

/**
 * @swagger
 * /api/clip-forge/projects:
 *   post:
 *     summary: Create a Clip Forge project from a YouTube video link
 *     description: |
 *       The ONLY required input is a YouTube video URL, plus an explicit
 *       ownership/authorization confirmation. No duration, privacy, style, or
 *       playlist settings are accepted here — the backend controls all of
 *       those via central configuration. This does not start the pipeline;
 *       call POST /:projectId/start afterward.
 *     tags: [Clip Forge]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [youtubeUrl, ownershipConfirmed]
 *             properties:
 *               youtubeUrl: { type: string, example: "https://www.youtube.com/watch?v=XXXXXXXX" }
 *               ownershipConfirmed: { type: boolean }
 *     responses:
 *       201:
 *         description: Project created
 *       422:
 *         description: Invalid URL or missing ownership confirmation
 */
router.post('/clip-forge/projects', async (req: Request, res: Response) => {
  const youtubeUrl = req.body?.youtubeUrl as string | undefined;
  const ownershipConfirmed = req.body?.ownershipConfirmed === true;
  const userId = (req.body?.userId as string | undefined) ?? SYSTEM_USER_ID;

  if (!youtubeUrl || !youtubeUrl.trim()) {
    throw new ValidationError('youtubeUrl is required');
  }
  if (!ownershipConfirmed) {
    throw new ValidationError(
      'ownershipConfirmed must be true — you must confirm you own this video or have permission to process and republish it',
    );
  }

  const project = await ClipForgeOrchestratorService.createProject({ userId, youtubeUrl });

  res.status(201).json({
    success: true,
    data: project,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/clip-forge/projects:
 *   get:
 *     summary: List Clip Forge projects
 *     tags: [Clip Forge]
 */
router.get('/clip-forge/projects', async (req: Request, res: Response) => {
  const page = Number(req.query['page'] ?? 1);
  const limit = Number(req.query['limit'] ?? 20);
  const userId = (req.query['userId'] as string | undefined) ?? SYSTEM_USER_ID;

  const result = await projectRepo.findByUser(userId, { page, limit });

  res.json({
    success: true,
    data: { data: result.data, total: result.total, page: result.page, limit: result.limit },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/clip-forge/projects/{projectId}:
 *   get:
 *     summary: Get a Clip Forge project's full status (project + parts + continuity validation)
 *     tags: [Clip Forge]
 */
router.get('/clip-forge/projects/:projectId', async (req: Request, res: Response) => {
  const userId = (req.query['userId'] as string | undefined) ?? SYSTEM_USER_ID;
  await requireOwnedProject(req.params['projectId'] as string, userId);

  const status = await ClipForgeOrchestratorService.getStatus(req.params['projectId'] as string);

  res.json({
    success: true,
    data: status,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/clip-forge/projects/{projectId}/start:
 *   post:
 *     summary: Start (or resume) the Clip Forge pipeline for a project
 *     description: Runs in the background; idempotent — safe to call again after a pause/failure to resume from the last checkpoint.
 *     tags: [Clip Forge]
 *     responses:
 *       202:
 *         description: Started in background
 *       409:
 *         description: Already running
 */
router.post('/clip-forge/projects/:projectId/start', async (req: Request, res: Response) => {
  const userId = (req.body?.userId as string | undefined) ?? SYSTEM_USER_ID;
  const projectId = req.params['projectId'] as string;
  await requireOwnedProject(projectId, userId);

  if (ClipForgeOrchestratorService.isRunning(projectId)) {
    res.status(409).json({
      success: false,
      error: { code: 'ALREADY_RUNNING', message: `Clip Forge project ${projectId} is already running.` },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    } satisfies ApiResponse);
    return;
  }

  ClipForgeOrchestratorService.startInBackground(projectId);

  res.status(202).json({
    success: true,
    data: { projectId, message: 'Clip Forge pipeline started in background.' },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/clip-forge/projects/{projectId}/pause:
 *   post:
 *     summary: Pause a running Clip Forge pipeline
 *     description: Cooperative — takes effect at the next part boundary. Resume with POST /:projectId/resume.
 *     tags: [Clip Forge]
 */
router.post('/clip-forge/projects/:projectId/pause', async (req: Request, res: Response) => {
  const userId = (req.body?.userId as string | undefined) ?? SYSTEM_USER_ID;
  const projectId = req.params['projectId'] as string;
  await requireOwnedProject(projectId, userId);

  const cancelled = ClipForgeOrchestratorService.cancel(projectId);

  res.json({
    success: true,
    data: { projectId, cancelled },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/clip-forge/projects/{projectId}/resume:
 *   post:
 *     summary: Resume a paused/failed/quota-waiting Clip Forge project
 *     description: Identical to /start — resumability is built into run() itself (every step is idempotent).
 *     tags: [Clip Forge]
 *     responses:
 *       202:
 *         description: Resumed in background
 *       409:
 *         description: Already running
 */
router.post('/clip-forge/projects/:projectId/resume', async (req: Request, res: Response) => {
  const userId = (req.body?.userId as string | undefined) ?? SYSTEM_USER_ID;
  const projectId = req.params['projectId'] as string;
  await requireOwnedProject(projectId, userId);

  if (ClipForgeOrchestratorService.isRunning(projectId)) {
    res.status(409).json({
      success: false,
      error: { code: 'ALREADY_RUNNING', message: `Clip Forge project ${projectId} is already running.` },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    } satisfies ApiResponse);
    return;
  }

  ClipForgeOrchestratorService.startInBackground(projectId);

  res.status(202).json({
    success: true,
    data: { projectId, message: 'Clip Forge pipeline resumed in background.' },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/clip-forge/projects/{projectId}/retry:
 *   post:
 *     summary: Reset FAILED parts and resume the pipeline
 *     tags: [Clip Forge]
 */
router.post('/clip-forge/projects/:projectId/retry', async (req: Request, res: Response) => {
  const userId = (req.body?.userId as string | undefined) ?? SYSTEM_USER_ID;
  const projectId = req.params['projectId'] as string;
  await requireOwnedProject(projectId, userId);

  if (ClipForgeOrchestratorService.isRunning(projectId)) {
    res.status(409).json({
      success: false,
      error: { code: 'ALREADY_RUNNING', message: `Clip Forge project ${projectId} is already running.` },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    } satisfies ApiResponse);
    return;
  }

  await ClipForgeOrchestratorService.retryFailedParts(projectId);
  ClipForgeOrchestratorService.startInBackground(projectId);

  res.status(202).json({
    success: true,
    data: { projectId, message: 'Failed parts reset; pipeline resumed in background.' },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/clip-forge/projects/{projectId}:
 *   delete:
 *     summary: Delete a Clip Forge project
 *     description: Refuses to delete a project that is currently running.
 *     tags: [Clip Forge]
 *     responses:
 *       200:
 *         description: Deleted
 *       409:
 *         description: Project is currently running
 */
router.delete('/clip-forge/projects/:projectId', async (req: Request, res: Response) => {
  const userId = (req.query['userId'] as string | undefined) ?? SYSTEM_USER_ID;
  const projectId = req.params['projectId'] as string;
  await requireOwnedProject(projectId, userId);

  if (ClipForgeOrchestratorService.isRunning(projectId)) {
    throw new ConflictError(`Cannot delete Clip Forge project ${projectId} while it is running — pause it first.`);
  }

  await projectRepo.delete(projectId);

  res.json({
    success: true,
    data: { projectId, deleted: true },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/clip-forge/projects/{projectId}/parts:
 *   get:
 *     summary: List all parts for a Clip Forge project, ordered by part number
 *     tags: [Clip Forge]
 */
router.get('/clip-forge/projects/:projectId/parts', async (req: Request, res: Response) => {
  const userId = (req.query['userId'] as string | undefined) ?? SYSTEM_USER_ID;
  const projectId = req.params['projectId'] as string;
  await requireOwnedProject(projectId, userId);

  const parts = await partRepo.findByProjectId(projectId);

  res.json({
    success: true,
    data: parts,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/clip-forge/projects/{projectId}/parts/{partId}:
 *   get:
 *     summary: Get a single Clip Forge part
 *     tags: [Clip Forge]
 */
router.get('/clip-forge/projects/:projectId/parts/:partId', async (req: Request, res: Response) => {
  const userId = (req.query['userId'] as string | undefined) ?? SYSTEM_USER_ID;
  const projectId = req.params['projectId'] as string;
  await requireOwnedProject(projectId, userId);

  const part = await partRepo.findByIdForProject(req.params['partId'] as string, projectId);
  if (!part) throw new NotFoundError('ClipForgePart', req.params['partId'] as string);

  res.json({
    success: true,
    data: part,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/clip-forge/projects/{projectId}/validate-continuity:
 *   post:
 *     summary: Re-run continuity validation for a project's current split plan
 *     tags: [Clip Forge]
 */
router.post('/clip-forge/projects/:projectId/validate-continuity', async (req: Request, res: Response) => {
  const userId = (req.body?.userId as string | undefined) ?? SYSTEM_USER_ID;
  const projectId = req.params['projectId'] as string;
  const project = await requireOwnedProject(projectId, userId);

  if (project.sourceDuration == null) {
    throw new ValidationError('Source video has not been ingested yet — start the pipeline first.');
  }

  const parts = await partRepo.findByProjectId(projectId);
  const result = validateContinuity(parts, project.sourceDuration);

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

export { router as clipForgeRouter };
