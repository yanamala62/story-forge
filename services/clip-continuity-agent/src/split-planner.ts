/**
 * Deterministic, continuous split planner.
 *
 * NOT transcript-based, NOT AI-based. Pure arithmetic over the source media
 * timeline (the ffprobe-reported duration is the source of truth). Guarantees:
 *   - Part 1 starts at 0
 *   - Part N's end === Part N+1's start (zero gaps, zero overlaps)
 *   - The final part ends exactly at sourceDuration (may be shorter than target)
 *   - No source content is skipped, reordered, or duplicated
 *
 * Timestamps are rounded to millisecond precision (3 decimal places) at each
 * step and the NEXT start is always taken from the PREVIOUS end verbatim
 * (never recomputed as `partNumber * targetDuration`) — this is what prevents
 * cumulative floating-point drift across hundreds of parts.
 */

const TIMESTAMP_PRECISION = 3; // decimal places — millisecond resolution

/** Rounds to TIMESTAMP_PRECISION decimal places, avoiding binary float noise (e.g. 60.00000000000001). */
export function roundTimestamp(value: number): number {
  const factor = 10 ** TIMESTAMP_PRECISION;
  return Math.round(value * factor) / factor;
}

export interface SplitPlanPart {
  partNumber: number;
  partLabel: string;
  totalParts: number;
  startTime: number;
  endTime: number;
  duration: number;
}

export interface SplitPlanInput {
  sourceDuration: number;
  targetDurationSeconds: number;
}

export class SplitPlanError extends Error {}

function formatPartLabel(partNumber: number): string {
  return `Part ${String(partNumber).padStart(3, '0')}`;
}

/**
 * Builds the complete continuous split plan for a source video.
 *
 * Example: sourceDuration=185, targetDurationSeconds=60 →
 *   Part 001: 0     → 60
 *   Part 002: 60    → 120
 *   Part 003: 120   → 180
 *   Part 004: 180   → 185   (shorter final part — never discarded/merged)
 */
export function buildContinuousSplitPlan(input: SplitPlanInput): SplitPlanPart[] {
  const sourceDuration = roundTimestamp(input.sourceDuration);
  const targetDuration = input.targetDurationSeconds;

  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    throw new SplitPlanError(`sourceDuration must be a positive finite number, got ${input.sourceDuration}`);
  }
  if (!Number.isFinite(targetDuration) || targetDuration <= 0) {
    throw new SplitPlanError(`targetDurationSeconds must be a positive finite number, got ${input.targetDurationSeconds}`);
  }

  const parts: Omit<SplitPlanPart, 'partLabel' | 'totalParts'>[] = [];
  let cursor = 0;
  let partNumber = 0;

  // Safety ceiling — a runaway loop (e.g. targetDuration rounding to ~0) must
  // never hang the process. 3-hour source / 1-second parts is ~10,800 parts;
  // 200,000 gives enormous headroom while still being a hard backstop.
  const MAX_PARTS = 200_000;

  while (cursor < sourceDuration) {
    partNumber += 1;
    const start = cursor;
    const end = roundTimestamp(Math.min(start + targetDuration, sourceDuration));

    if (end <= start) {
      // Guards against a pathological targetDuration/precision combination
      // producing a zero-length or negative-length part instead of looping forever.
      throw new SplitPlanError(
        `Split planning produced a non-advancing part at partNumber=${partNumber} (start=${start}, end=${end})`,
      );
    }

    parts.push({ partNumber, startTime: start, endTime: end, duration: roundTimestamp(end - start) });

    cursor = end; // next start === this end, verbatim — no recomputation, no drift

    if (partNumber > MAX_PARTS) {
      throw new SplitPlanError(`Split plan exceeded safety limit of ${MAX_PARTS} parts`);
    }
  }

  const totalParts = parts.length;

  return parts.map((p) => ({
    ...p,
    totalParts,
    partLabel: formatPartLabel(p.partNumber),
  }));
}
