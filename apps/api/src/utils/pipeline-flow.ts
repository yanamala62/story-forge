/**
 * Writes clean, visual pipeline flow rows directly to stdout, and mirrors the
 * same events to PipelineLogBus so the UI's live log panel shows identical
 * information to the terminal.
 */
import { PipelineLogBus } from '../services/pipeline-log-bus.js';

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

    PipelineLogBus.clear(episodeId);
    PipelineLogBus.emit(episodeId, 'info', `Pipeline triggered for episode ${episodeNumber} (current status: ${currentStatus})`);
    PipelineLogBus.emit(episodeId, 'info', `Upload to YouTube: ${uploadToYoutube ? 'yes' : 'no'}`);
  },

  stepPending(episodeId: string, name: string): void {
    line('⚫', 'PENDING', name);
    PipelineLogBus.emit(episodeId, 'info', `${name}: pending`);
  },

  stepCalling(episodeId: string, name: string, api: string): void {
    line('🔵', 'CALLING', name, `→  ${api}`);
    PipelineLogBus.emit(episodeId, 'info', `${name} → calling ${api}...`);
  },

  stepSkip(episodeId: string, name: string): void {
    line('✅', 'SKIP', name, '✓  already done');
    PipelineLogBus.emit(episodeId, 'success', `${name} already complete — skipping`);
  },

  stepDone(episodeId: string, name: string, elapsedMs: number): void {
    line('🟢', 'DONE', name, `✓  ${(elapsedMs / 1000).toFixed(1)}s`);
    PipelineLogBus.emit(episodeId, 'success', `${name} done in ${(elapsedMs / 1000).toFixed(1)}s — moving to next step`);
  },

  stepRetry(episodeId: string, name: string, attempt: number, max: number, kind: string, waitSec: number): void {
    line('🟡', 'RETRY', name, `↻  attempt ${attempt}/${max} (${kind}) — wait ${waitSec}s`);
    PipelineLogBus.emit(episodeId, 'warn', `${name} retry ${attempt}/${max} (${kind}) — waiting ${waitSec}s`);
  },

  stepFail(episodeId: string, name: string, elapsedMs: number, error: string): void {
    const short = error.length > 55 ? error.slice(0, 55) + '…' : error;
    line('🔴', 'FAILED', name, `✗  ${(elapsedMs / 1000).toFixed(1)}s  —  ${short}`);
    PipelineLogBus.emit(episodeId, 'error', `${name} failed after ${(elapsedMs / 1000).toFixed(1)}s — ${error}`);
  },

  end(episodeId: string, success: boolean, finalStatus: string, totalMs: number, completed: number, skipped: number): void {
    divider('├');
    if (success) {
      process.stdout.write(
        `${ts()} ${PREFIX}    ✅  COMPLETE  •  ${completed} done  •  ${skipped} skipped  •  total: ${(totalMs / 1000).toFixed(1)}s\n`,
      );
      PipelineLogBus.emit(episodeId, 'success', `Pipeline complete — ${completed} done, ${skipped} skipped, total ${(totalMs / 1000).toFixed(1)}s`);
    } else {
      process.stdout.write(
        `${ts()} ${PREFIX}    ❌  FAILED    •  status: ${finalStatus}  •  after ${(totalMs / 1000).toFixed(1)}s\n`,
      );
      PipelineLogBus.emit(episodeId, 'error', `Pipeline failed — status ${finalStatus} after ${(totalMs / 1000).toFixed(1)}s`);
    }
    divider('└');
    process.stdout.write('\n');
  },
};
