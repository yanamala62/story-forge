import { randomUUID } from 'crypto';

export function generateId(): string {
  return randomUUID();
}

export function generateJobId(queue: string, entityId: string): string {
  return `${queue}:${entityId}:${Date.now()}`;
}

export function generateRequestId(): string {
  return randomUUID().replace(/-/g, '').substring(0, 16);
}
