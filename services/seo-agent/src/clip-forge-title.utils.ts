const YOUTUBE_TITLE_MAX_LENGTH = 100;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

function padPartNumber(partNumber: number, totalParts: number): string {
  const width = Math.max(3, String(totalParts).length);
  return String(partNumber).padStart(width, '0');
}

export function formatPartLabel(partNumber: number, totalParts: number): string {
  return `Part ${padPartNumber(partNumber, totalParts)}`;
}

/**
 * The ALWAYS-SAFE fallback title. Used whenever AI title generation fails,
 * times out, or produces an invalid result — the fallback must never itself
 * fail validation, so it's assembled directly from known-good inputs.
 */
export function buildFallbackClipForgeTitle(originalVideoTitle: string, partNumber: number, totalParts: number): string {
  const partLabel = formatPartLabel(partNumber, totalParts);
  const suffix = ` | ${partLabel} #Shorts`;
  const maxTitlePortion = YOUTUBE_TITLE_MAX_LENGTH - suffix.length;
  const safeOriginal =
    originalVideoTitle.length > maxTitlePortion
      ? `${originalVideoTitle.slice(0, Math.max(0, maxTitlePortion - 1)).trimEnd()}…`
      : originalVideoTitle;
  return `${safeOriginal}${suffix}`;
}

export interface TitleValidationResult {
  valid: boolean;
  reasons: string[];
}

/**
 * Validates a generated Clip Forge title per the product spec's SEO TITLE
 * VALIDATION section: must contain the Part number, fit YouTube's length
 * limit, be non-empty, and contain no control characters.
 */
export function validateClipForgeTitle(title: string, partNumber: number, totalParts: number): TitleValidationResult {
  const reasons: string[] = [];

  const trimmed = title.trim();
  if (!trimmed) reasons.push('Title is empty');
  if (trimmed.length > YOUTUBE_TITLE_MAX_LENGTH) reasons.push(`Title exceeds ${YOUTUBE_TITLE_MAX_LENGTH} characters`);
  if (CONTROL_CHAR_PATTERN.test(trimmed)) reasons.push('Title contains unsupported control characters');

  const partLabel = formatPartLabel(partNumber, totalParts);
  if (!trimmed.includes(partLabel)) reasons.push(`Title does not contain the required part label "${partLabel}"`);

  return { valid: reasons.length === 0, reasons };
}
