/**
 * Tracks live, in-flight progress (e.g. "3/6 images generated") for a step
 * that's still running — not yet reflected in any DB row. Read by
 * GET /pipeline/status so the UI can show a live fraction on the currently
 * running step, not just its coarse pending/running/completed/failed state.
 */
export interface PipelineProgressEntry {
  done: number;
  total: number;
}

const progress = new Map<string, PipelineProgressEntry>();

export const PipelineProgress = {
  set(episodeId: string, done: number, total: number): void {
    progress.set(episodeId, { done, total });
  },

  get(episodeId: string): PipelineProgressEntry | undefined {
    return progress.get(episodeId);
  },

  clear(episodeId: string): void {
    progress.delete(episodeId);
  },
};
