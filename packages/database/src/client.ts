import { PrismaClient } from '@prisma/client';
import { createLogger } from '@storyforge/shared';

const logger = createLogger('prisma');

function createPrismaClient(): PrismaClient {
  const isDev = process.env['NODE_ENV'] !== 'production';

  return new PrismaClient({
    log: isDev
      ? [
          { emit: 'stdout', level: 'error' },
          { emit: 'stdout', level: 'warn' },
        ]
      : [{ emit: 'stdout', level: 'error' }],
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  process.env['NODE_ENV'] === 'production'
    ? createPrismaClient()
    : (globalThis.__prismaClient ??= createPrismaClient());

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected successfully');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
