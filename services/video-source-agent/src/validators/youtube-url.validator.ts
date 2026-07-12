import { ValidationError } from '@storyforge/shared';

// A YouTube video ID is always exactly 11 characters from this charset.
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export interface ValidatedYouTubeUrl {
  videoId: string;
}

/**
 * Extracts the 11-char video ID from any common YouTube URL shape. Returns
 * null (never throws) so callers can decide how to handle an invalid URL —
 * this is the pure/testable half of validateYouTubeUrl.
 *
 * Supported shapes:
 *   https://www.youtube.com/watch?v=VIDEOID(&...)
 *   https://youtu.be/VIDEOID(?...)
 *   https://www.youtube.com/shorts/VIDEOID
 *   https://www.youtube.com/embed/VIDEOID
 *   https://www.youtube.com/live/VIDEOID
 *   with or without "www.", "m.", or a leading "https://"
 */
export function extractVideoId(url: string): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;

  let parsed: URL;
  try {
    // Tolerate a bare "youtube.com/..." with no protocol.
    parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\.|^m\./, '');

  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    return VIDEO_ID_PATTERN.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v') ?? '';
      return VIDEO_ID_PATTERN.test(id) ? id : null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const prefixesWithId = ['shorts', 'embed', 'live', 'v'];
    if (segments.length >= 2 && prefixesWithId.includes(segments[0]!)) {
      const id = segments[1]!;
      return VIDEO_ID_PATTERN.test(id) ? id : null;
    }
  }

  return null;
}

/** Throws ValidationError with a clear message on any non-YouTube / malformed URL. */
export function validateYouTubeUrl(url: string): ValidatedYouTubeUrl {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new ValidationError(
      'Invalid YouTube video URL. Expected a link like https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID.',
      { url },
    );
  }
  return { videoId };
}
