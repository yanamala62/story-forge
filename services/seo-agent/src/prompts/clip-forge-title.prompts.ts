export interface ClipForgeTitlePromptContext {
  originalVideoTitle: string;
  partNumber: number;
  totalParts: number;
  startTime: number;
  endTime: number;
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * IMPORTANT: this prompt deliberately does NOT ask the model to include the
 * Part number — the calling service (SeoAgentService.generateClipForgeTitle)
 * appends " | Part NNN #Shorts" itself, deterministically, after the model
 * responds. That guarantees every title contains the correct Part number
 * regardless of what the LLM returns, per the product spec's non-negotiable
 * "every title MUST contain the Part Number" rule — we don't rely on model
 * compliance for a hard requirement.
 */
export function buildClipForgeTitlePrompt(ctx: ClipForgeTitlePromptContext): string {
  return `You are a YouTube Shorts SEO specialist. A long-form video is being split into a continuous series of Shorts, part-by-part, covering the ENTIRE original video with no skipped content.

ORIGINAL VIDEO TITLE: "${ctx.originalVideoTitle}"
THIS CLIP: Part ${ctx.partNumber} of ${ctx.totalParts}, covering ${formatTimestamp(ctx.startTime)}–${formatTimestamp(ctx.endTime)} of the original video.

YOUR TASK:
Write a short (4-8 word) SEO-friendly phrase describing what this specific segment likely covers, based ONLY on its position in the video and the original title — do not invent specific claims you cannot know from this information alone. If you cannot infer anything specific about this segment, return a short generic phrase based on the original title instead (e.g. reuse its main subject).

RULES:
- Do NOT include the words "Part", a part number, or "#Shorts" — those are added automatically afterward.
- Do NOT use clickbait or make misleading/false claims.
- Keep it concise: 4-8 words.
- Natural, descriptive, YouTube-friendly language.

Return ONLY valid JSON, no markdown:
{ "phrase": "string" }`;
}
