/**
 * Writes clean, visual pipeline flow rows directly to stdout, and mirrors the
 * same events to PipelineLogBus so the UI's live log panel shows identical
 * information to the terminal.
 *
 * Key design changes vs. original:
 * - pipelineFlow.start() no longer wipes the log buffer — it appends a
 *   separator so retry history is fully preserved in the UI panel.
 * - Every transition emits a rich log entry so the UI panel is a complete
 *   end-to-end trace, not just step-level summaries.
 */
import { PipelineLogBus } from '../services/pipeline-log-bus.js';
import { PipelineProgress } from '../services/pipeline-progress.js';

function ts(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

const PREFIX = `[PIPELINE]`;
const W_STATUS = 8;
const W_NAME   = 26;

function line(icon: string, status: string, name: string, detail = ''): void {
  const s = status.padEnd(W_STATUS);
  const n = name.padEnd(W_NAME);
  process.stdout.write(`${ts()} ${PREFIX} │  ${icon}  ${s}  ${n}  ${detail}\n`);
}

function divider(char = '─'): void {
  process.stdout.write(`${ts()} ${PREFIX} ${char.repeat(72)}\n`);
}

export const pipelineFlow = {
  start(episodeId: string, episodeNumber: number, currentStatus: string, uploadToYoutube: boolean): void {
    process.stdout.write('\n');
    divider('┌');
    process.stdout.write(`${ts()} ${PREFIX}    Episode ${episodeId.slice(0, 8)}…  •  ep.${episodeNumber}  •  status: ${currentStatus}\n`);
    process.stdout.write(`${ts()} ${PREFIX}    Upload to YouTube: ${uploadToYoutube ? 'Yes' : 'No'}\n`);
    divider('├');

    // Preserve existing buffer — append a visual separator so the user can
    // distinguish between runs in the live log panel (instead of a blank panel).
    PipelineLogBus.separator(episodeId, `Run started — Episode #${episodeNumber} (was: ${currentStatus})`);
    PipelineProgress.clear(episodeId);

    PipelineLogBus.emit(episodeId, 'info', `▶  Pipeline triggered for episode #${episodeNumber}`);
    PipelineLogBus.emit(episodeId, 'info', `   Current DB status: ${currentStatus}`);
    PipelineLogBus.emit(episodeId, 'info', `   YouTube upload: ${uploadToYoutube ? 'yes' : 'no'}`);
  },

  stepPending(episodeId: string, name: string): void {
    line('⚫', 'PENDING', name);
    PipelineLogBus.emit(episodeId, 'info', `⚫  ${name}: queued`);
  },

  stepCalling(episodeId: string, name: string, api: string): void {
    line('🔵', 'CALLING', name, `→  ${api}`);
    PipelineLogBus.emit(episodeId, 'info', `🔵  ${name} → calling ${api}...`);
  },

  stepSkip(episodeId: string, name: string): void {
    line('✅', 'SKIP', name, '✓  already done');
    PipelineLogBus.emit(episodeId, 'success', `✅  ${name} already complete — skipping`);
  },

  stepDone(episodeId: string, name: string, elapsedMs: number): void {
    line('🟢', 'DONE', name, `✓  ${(elapsedMs / 1000).toFixed(1)}s`);
    PipelineProgress.clear(episodeId);
    PipelineLogBus.emit(episodeId, 'success', `✅  ${name} done in ${(elapsedMs / 1000).toFixed(1)}s`);
  },

  stepRetry(episodeId: string, name: string, attempt: number, max: number, kind: string, waitSec: number): void {
    line('🟡', 'RETRY', name, `↻  attempt ${attempt}/${max} (${kind}) — wait ${waitSec}s`);
    PipelineLogBus.emit(episodeId, 'warn', `🔄  ${name} retry ${attempt}/${max} (${kind}) — waiting ${waitSec}s before next attempt`);
  },

  stepFail(episodeId: string, name: string, elapsedMs: number, error: string): void {
    const short = error.length > 55 ? error.slice(0, 55) + '…' : error;
    line('🔴', 'FAILED', name, `✗  ${(elapsedMs / 1000).toFixed(1)}s  —  ${short}`);
    PipelineProgress.clear(episodeId);
    // Emit the full error message (not truncated) to the UI log bus.
    PipelineLogBus.emit(episodeId, 'error', `❌  ${name} failed after ${(elapsedMs / 1000).toFixed(1)}s`);
    PipelineLogBus.emit(episodeId, 'error', `   Error: ${error}`);
  },

  /** Emit a plain informational message directly to the UI log panel. */
  info(episodeId: string, message: string): void {
    PipelineLogBus.emit(episodeId, 'info', `   ${message}`);
  },

  /** Emit a warning directly to the UI log panel (e.g. subprocess stderr warnings). */
  warn(episodeId: string, message: string): void {
    process.stdout.write(`${ts()} ${PREFIX} ⚠  ${message}\n`);
    PipelineLogBus.emit(episodeId, 'warn', `⚠  ${message}`);
  },

  end(episodeId: string, success: boolean, finalStatus: string, totalMs: number, completed: number, skipped: number): void {
    divider('├');
    if (success) {
      process.stdout.write(
        `${ts()} ${PREFIX}    ✅  COMPLETE  •  ${completed} done  •  ${skipped} skipped  •  total: ${(totalMs / 1000).toFixed(1)}s\n`,
      );
      PipelineLogBus.emit(episodeId, 'success', `🏁  Pipeline complete — ${completed} step(s) ran, ${skipped} skipped, total ${(totalMs / 1000).toFixed(1)}s`);
    } else {
      process.stdout.write(
        `${ts()} ${PREFIX}    ❌  FAILED    •  status: ${finalStatus}  •  after ${(totalMs / 1000).toFixed(1)}s\n`,
      );
      PipelineLogBus.emit(episodeId, 'error', `💀  Pipeline failed — status: ${finalStatus} after ${(totalMs / 1000).toFixed(1)}s`);
      PipelineLogBus.emit(episodeId, 'error', `   Trigger again to retry from the last completed step.`);
    }
    divider('└');
    process.stdout.write('\n');
  },
};
