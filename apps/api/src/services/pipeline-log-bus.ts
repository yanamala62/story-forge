import { EventEmitter } from 'events';

export type PipelineLogLevel = 'info' | 'success' | 'warn' | 'error';

export interface PipelineLogEntry {
  ts: string;
  level: PipelineLogLevel;
  message: string;
}

const MAX_BUFFER = 1000;

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

  /**
   * Append a separator line between pipeline runs so history is preserved.
   * Previously this wiped the buffer, causing users to see a blank log panel
   * immediately after triggering a retry.
   */
  separator(episodeId: string, label: string): void {
    const entry: PipelineLogEntry = {
      ts: new Date().toISOString(),
      level: 'info',
      message: `──────────── ${label} ────────────`,
    };
    const buffer = buffers.get(episodeId) ?? [];
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER) buffer.shift();
    buffers.set(episodeId, buffer);
    getEmitter(episodeId).emit('log', entry);
  },

  clear(episodeId: string): void {
    buffers.delete(episodeId);

    // Also drop the emitter itself — otherwise one accumulates per distinct
    // episode ID for the life of the process (buffers alone are bounded by
    // MAX_BUFFER, but this Map never shrunk). Only evict when nobody's
    // actively subscribed, so an open SSE stream from a previous run is
    // never yanked out from under a live listener.
    const emitter = emitters.get(episodeId);
    if (emitter && emitter.listenerCount('log') === 0) {
      emitters.delete(episodeId);
    }
  },
};
