import { Router, type Request, type Response } from 'express';
import { checkDatabaseHealth } from '@storyforge/database';
import { createLogger } from '@storyforge/shared';
import type { HealthCheckResponse, ServiceHealth, ApiResponse } from '@storyforge/shared';
import { redisClient } from '../infrastructure/redis.js';

const router = Router();
const logger = createLogger('health');

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns the health status of the API and all connected services
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is healthy
 *       503:
 *         description: Service is unhealthy
 */
router.get('/', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  const [dbHealthy, redisHealthy, ollamaHealthy, comfyuiHealthy] = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkOllama(),
    checkComfyUI(),
  ]);

  const services: Record<string, ServiceHealth> = {
    database: resolveServiceHealth(dbHealthy),
    redis: resolveServiceHealth(redisHealthy),
    // Ollama and ComfyUI are optional — not used in current config (OpenRouter + Pollinations)
    ollama: resolveServiceHealth(ollamaHealthy),
    comfyui: resolveServiceHealth(comfyuiHealthy),
  };

  // Only critical services (DB + Redis) determine overall health
  const criticalDown =
    services['database']?.status === 'down' || services['redis']?.status === 'down';
  const allCriticalUp =
    services['database']?.status === 'up' && services['redis']?.status === 'up';

  const overallStatus: HealthCheckResponse['status'] = allCriticalUp ? 'healthy' : 'degraded';

  const payload: ApiResponse<HealthCheckResponse> = {
    success: true,
    data: {
      status: overallStatus,
      version: process.env['APP_VERSION'] ?? '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services,
    },
    timestamp: new Date().toISOString(),
    requestId: _req.requestId,
  };

  const statusCode = criticalDown ? 503 : 200;
  res.status(statusCode).json(payload);

  logger.debug('Health check completed', {
    durationMs: Date.now() - startTime,
    status: overallStatus,
  });
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness check
 *     description: Returns 200 only when all critical services are ready
 *     tags: [Health]
 *     security: []
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const dbOk = await checkDatabase().then(() => true).catch(() => false);
  const redisOk = await checkRedis().then(() => true).catch(() => false);

  if (dbOk && redisOk) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false, database: dbOk, redis: redisOk });
  }
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness check
 *     description: Returns 200 if the process is alive
 *     tags: [Health]
 *     security: []
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ alive: true, pid: process.pid });
});

async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();
  const healthy = await checkDatabaseHealth();
  return {
    status: healthy ? 'up' : 'down',
    latencyMs: Date.now() - start,
  };
}

async function checkRedis(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const pong = await redisClient.ping();
    return { status: pong === 'PONG' ? 'up' : 'down', latencyMs: Date.now() - start };
  } catch (error) {
    return { status: 'down', latencyMs: Date.now() - start, error: String(error) };
  }
}

async function checkOllama(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const baseUrl = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
    const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    return { status: response.ok ? 'up' : 'down', latencyMs: Date.now() - start };
  } catch (error) {
    return { status: 'down', latencyMs: Date.now() - start, error: String(error) };
  }
}

async function checkComfyUI(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const baseUrl = process.env['COMFYUI_BASE_URL'] ?? 'http://localhost:8188';
    const response = await fetch(`${baseUrl}/system_stats`, { signal: AbortSignal.timeout(5000) });
    return { status: response.ok ? 'up' : 'down', latencyMs: Date.now() - start };
  } catch (error) {
    return { status: 'down', latencyMs: Date.now() - start, error: String(error) };
  }
}

function resolveServiceHealth(result: PromiseSettledResult<ServiceHealth>): ServiceHealth {
  if (result.status === 'fulfilled') return result.value;
  return { status: 'down', error: String(result.reason) };
}

export { router as healthRouter };
