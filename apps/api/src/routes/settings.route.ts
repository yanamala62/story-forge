import { Router, type Request, type Response } from 'express';
import { UploadAgentService } from '@storyforge/upload-agent';
import { createLogger, ValidationError } from '@storyforge/shared';
import type { ApiResponse } from '@storyforge/shared';

const router = Router();
const logger = createLogger('settings-route');
const uploadAgent = new UploadAgentService();

/**
 * @swagger
 * /api/settings/youtube/auth-url:
 *   get:
 *     summary: Get the Google consent-screen URL for "Reconnect YouTube"
 *     description: |
 *       Open this URL in a new tab. After approving access, Google displays an
 *       authorization code directly on the page (out-of-band flow) — paste that
 *       code into POST /api/settings/youtube/exchange-code to finish reconnecting.
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: The consent-screen URL
 */
router.get('/settings/youtube/auth-url', (req: Request, res: Response) => {
  const url = uploadAgent.buildYouTubeAuthUrl();
  res.json({
    success: true,
    data: { url },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/settings/youtube/exchange-code:
 *   post:
 *     summary: Complete "Reconnect YouTube" with the code pasted from Google
 *     description: Exchanges the authorization code for a refresh token and persists it.
 *     tags: [Settings]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string }
 *     responses:
 *       200:
 *         description: Reconnected successfully
 *       400:
 *         description: Missing code or exchange failed
 */
router.post('/settings/youtube/exchange-code', async (req: Request, res: Response) => {
  const code = req.body?.code as string | undefined;
  if (!code || !code.trim()) {
    throw new ValidationError('code is required');
  }

  await uploadAgent.completeYouTubeReconnect(code);
  logger.info('YouTube reconnected via pasted code');

  res.json({
    success: true,
    data: { reconnected: true },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/settings/youtube/status:
 *   get:
 *     summary: Whether YouTube is configured and the refresh token is currently valid
 *     tags: [Settings]
 */
router.get('/settings/youtube/status', async (req: Request, res: Response) => {
  const result = await uploadAgent.checkYouTubeHealth();
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

export { router as settingsRouter };
