import { EventEmitter } from 'events';

export type PipelineLogLevel = 'info' | 'success' | 'warn' | 'error';

export interface PipelineLogEntry {
  ts: string;
  level: PipelineLogLevel;
  message: string;
}

const MAX_BUFFER = 500;

const emitters = new Map<string, EventEmitter>();
const buffers = new Map<string, PipelineLogEntry[]>();

function getEmitter(episodeId: string): EventEmitter {
  let emitter = emitters.get(episodeId);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(20);
    emitters.set(episodeId, emitter);
  }
  return emitter;
}

export const PipelineLogBus = {
  emit(episodeId: string, level: PipelineLogLevel, message: string): void {
    const entry: PipelineLogEntry = { ts: new Date().toISOString(), level, message };
    const buffer = buffers.get(episodeId) ?? [];
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER) buffer.shift();
    buffers.set(episodeId, buffer);
    getEmitter(episodeId).emit('log', entry);
  },

  getBuffer(episodeId: string): PipelineLogEntry[] {
    return buffers.get(episodeId) ?? [];
  },

  subscribe(episodeId: string, listener: (entry: PipelineLogEntry) => void): () => void {
    const emitter = getEmitter(episodeId);
    emitter.on('log', listener);
    return () => emitter.off('log', listener);
  },

  clear(episodeId: string): void {
    buffers.delete(episodeId);
  },
};
