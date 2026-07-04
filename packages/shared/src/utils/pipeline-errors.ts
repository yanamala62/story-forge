/**
 * Error classification for the pipeline orchestrator.
 *
 * Three categories:
 *  - RATE_LIMIT  → wait ~65s then retry the same step
 *  - RETRYABLE   → transient network/provider issue, retry with backoff
 *  - FATAL       → invalid API key, bad code, etc. — stop and alert
 */

export type PipelineErrorKind = 'RATE_LIMIT' | 'RETRYABLE' | 'FATAL';

export interface ClassifiedError {
  kind: PipelineErrorKind;
  retryAfterMs: number;
  message: string;
  raw: unknown;
}

export function classifyPipelineError(error: unknown): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // Pull HTTP status out of ExternalServiceError.details if present
  const httpStatus = extractHttpStatus(error);

  // ── Rate limit (429) ────────────────────────────────────────────────────────
  if (httpStatus === 429 || lower.includes('rate limit') || lower.includes('429')) {
    return {
      kind: 'RATE_LIMIT',
      retryAfterMs: 65_000,
      message: `Rate limit hit — will retry after 65 s: ${message}`,
      raw: error,
    };
  }

  // ── Fatal (auth, bad request, etc.) ─────────────────────────────────────────
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    lower.includes('user not found') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('forbidden')
  ) {
    return {
      kind: 'FATAL',
      retryAfterMs: 0,
      message: `Fatal auth error — human intervention required: ${message}`,
      raw: error,
    };
  }

  // ── Retryable (network, timeout, 5xx, provider errors) ───────────────────────
  return {
    kind: 'RETRYABLE',
    retryAfterMs: 15_000,
    message: `Transient error — will retry: ${message}`,
    raw: error,
  };
}

function extractHttpStatus(error: unknown): number | null {
  if (error == null || typeof error !== 'object') return null;
  const err = error as Record<string, unknown>;

  // ExternalServiceError.details.status
  if (typeof err['details'] === 'object' && err['details'] !== null) {
    const details = err['details'] as Record<string, unknown>;
    if (typeof details['status'] === 'number') return details['status'];
  }

  // Direct statusCode property
  if (typeof err['statusCode'] === 'number') return err['statusCode'];

  return null;
}
