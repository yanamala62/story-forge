import { roundTimestamp } from './split-planner.js';
import type { SplitPlanPart } from './split-planner.js';

export interface TimeRange {
  start: number;
  end: number;
}

export interface ContinuityValidationResult {
  valid: boolean;
  sourceDuration: number;
  coveredDuration: number;
  missingRanges: TimeRange[];
  overlapRanges: TimeRange[];
  duplicateRanges: TimeRange[];
  details: {
    numberOfParts: number;
    firstPartStart: number | null;
    lastPartEnd: number | null;
    reasons: string[];
  };
}

interface ValidatablePart {
  partNumber: number;
  startTime: number;
  endTime: number;
}

const EPSILON = 0.005; // half a rounding step at millisecond precision — tolerate float noise, not real gaps

/**
 * Validates that a set of parts covers the source video's timeline exactly
 * once, start to finish, in order, with zero gaps and zero overlaps.
 *
 * This is the hard gate before any rendering/upload happens — the orchestrator
 * MUST call this and refuse to proceed (CONTINUITY_VALIDATION_FAILED) if
 * `valid` is false.
 */
export function validateContinuity(
  parts: ValidatablePart[] | SplitPlanPart[],
  sourceDuration: number,
): ContinuityValidationResult {
  const reasons: string[] = [];
  const missingRanges: TimeRange[] = [];
  const overlapRanges: TimeRange[] = [];
  const duplicateRanges: TimeRange[] = [];

  const srcDuration = roundTimestamp(sourceDuration);

  if (!Number.isFinite(srcDuration) || srcDuration <= 0) {
    reasons.push(`sourceDuration must be a positive finite number, got ${sourceDuration}`);
    return {
      valid: false,
      sourceDuration: srcDuration,
      coveredDuration: 0,
      missingRanges: [],
      overlapRanges: [],
      duplicateRanges: [],
      details: { numberOfParts: parts.length, firstPartStart: null, lastPartEnd: null, reasons },
    };
  }

  if (parts.length === 0) {
    reasons.push('No parts provided');
    return {
      valid: false,
      sourceDuration: srcDuration,
      coveredDuration: 0,
      missingRanges: [{ start: 0, end: srcDuration }],
      overlapRanges: [],
      duplicateRanges: [],
      details: { numberOfParts: 0, firstPartStart: null, lastPartEnd: null, reasons },
    };
  }

  // Sort by part number — validation must reflect the intended playback order,
  // not insertion order (defends against a caller passing an unsorted array).
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);

  // ── Structural checks: sequential numbering, no zero/negative-length parts ──
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    const expectedNumber = i + 1;
    if (p.partNumber !== expectedNumber) {
      reasons.push(
        `Part numbering is not sequential: expected partNumber=${expectedNumber} at index ${i}, got ${p.partNumber}`,
      );
    }
    if (roundTimestamp(p.endTime) <= roundTimestamp(p.startTime)) {
      reasons.push(`Part ${p.partNumber} has non-positive duration (start=${p.startTime}, end=${p.endTime})`);
    }
  }

  // ── First part must start at 0 ──────────────────────────────────────────
  const first = sorted[0]!;
  const firstStart = roundTimestamp(first.startTime);
  if (Math.abs(firstStart) > EPSILON) {
    reasons.push(`First part must start at 0.000, got ${firstStart}`);
  }

  // ── Last part must end exactly at sourceDuration ────────────────────────
  const last = sorted[sorted.length - 1]!;
  const lastEnd = roundTimestamp(last.endTime);
  if (Math.abs(lastEnd - srcDuration) > EPSILON) {
    reasons.push(`Last part must end at source duration ${srcDuration}, got ${lastEnd}`);
  }

  // ── Adjacent-pair checks: gaps, overlaps, duplicates ────────────────────
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i]!;
    const next = sorted[i + 1]!;
    const curEnd = roundTimestamp(cur.endTime);
    const nextStart = roundTimestamp(next.startTime);

    const delta = roundTimestamp(nextStart - curEnd);

    if (delta > EPSILON) {
      // Gap: next starts after current ends — missing source content.
      missingRanges.push({ start: curEnd, end: nextStart });
      reasons.push(`Gap detected between Part ${cur.partNumber} (end=${curEnd}) and Part ${next.partNumber} (start=${nextStart})`);
    } else if (delta < -EPSILON) {
      // Overlap: next starts before current ends — content covered twice.
      const overlapStart = nextStart;
      const overlapEnd = curEnd;
      overlapRanges.push({ start: overlapStart, end: overlapEnd });
      reasons.push(`Overlap detected between Part ${cur.partNumber} (end=${curEnd}) and Part ${next.partNumber} (start=${nextStart})`);
    }
  }

  // ── Duplicate range detection: identical (start,end) pairs used by 2+ parts ──
  const seen = new Map<string, number>();
  for (const p of sorted) {
    const key = `${roundTimestamp(p.startTime)}-${roundTimestamp(p.endTime)}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      const [start, end] = key.split('-').map(Number) as [number, number];
      duplicateRanges.push({ start, end });
      reasons.push(`Range ${start}-${end} is used by ${count} parts (duplicate)`);
    }
  }

  const coveredDuration = roundTimestamp(
    sorted.reduce((sum, p) => sum + Math.max(0, roundTimestamp(p.endTime) - roundTimestamp(p.startTime)), 0),
  );

  const valid = reasons.length === 0;

  return {
    valid,
    sourceDuration: srcDuration,
    coveredDuration,
    missingRanges,
    overlapRanges,
    duplicateRanges,
    details: {
      numberOfParts: sorted.length,
      firstPartStart: firstStart,
      lastPartEnd: lastEnd,
      reasons,
    },
  };
}
