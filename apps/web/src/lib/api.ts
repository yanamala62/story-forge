// Empty in dev (relies on the Vite proxy in vite.config.ts); set to the
// deployed API's origin in production, since a static site has no proxy.
const API_ORIGIN = import.meta.env.VITE_API_URL ?? '';
const BASE_URL = `${API_ORIGIN}/api`;

// System user — no auth yet
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  const body = await res.json().catch(() => ({ success: false, error: { message: res.statusText } }));

  if (!res.ok || body.success === false) {
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }

  return body.data as T;
}

// ── Story ─────────────────────────────────────────────────────────────────

export interface Story {
  id: string;
  title: string;
  genre: string;
  style: string;
  language: string;
  synopsis: string;
  targetAudience: string;
  isActive: boolean;
  episodeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStoryPayload {
  title: string;
  genre: string;
  style?: string;
  language?: string;
  synopsis: string;
  targetAudience?: string;
}

export const storiesApi = {
  list: (page = 1, limit = 20, language?: string) =>
    request<{ data: Story[]; total: number; page: number; limit: number }>(
      `/stories?page=${page}&limit=${limit}${language ? `&language=${language}` : ''}`,
    ),

  get: (id: string) => request<Story>(`/stories/${id}`),

  create: (payload: CreateStoryPayload) =>
    request<Story>('/stories', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userId: SYSTEM_USER_ID }),
    }),

  getInFlightEpisode: (storyId: string) =>
    request<{ id: string } | null>(`/stories/${storyId}/episodes/in-flight`),
};

// ── Episode ───────────────────────────────────────────────────────────────

export interface Episode {
  id: string;
  storyId: string;
  episodeNumber: number;
  title: string;
  content: string;
  hook: string;
  cliffhanger: string;
  duration: number;
  status: string;
  processingError: string | null;
  createdAt: string;
  updatedAt: string;
}

export const episodesApi = {
  list: (storyId: string, page = 1) =>
    request<{ data: Episode[]; total: number; page: number; limit: number }>(
      `/stories/${storyId}/episodes?page=${page}&limit=50`,
    ),

  get: (episodeId: string) => request<Episode>(`/episodes/${episodeId}`),

  generateNext: (storyId: string) =>
    request<Episode>(`/stories/${storyId}/generate-episode`, { method: 'POST' }),
};

// ── Pipeline ──────────────────────────────────────────────────────────────

export interface PipelineStep {
  id: string;   // 'M1' … 'M7'
  name: string; // 'M1: Story + Scenes', etc.
  status: 'completed' | 'running' | 'failed' | 'pending';
  error?: string | null;
  progress?: { done: number; total: number };
}

export interface PipelineStatus {
  episodeId: string;
  status: string;
  processingError: string | null | undefined;
  completedSteps: string[];
  pendingSteps: string[];
  steps: PipelineStep[];
  isRunning: boolean;
  detail: {
    sceneCount: number;
    imageCount: number;
    hasAudio: boolean;
    hasSubtitles: boolean;
    hasVideo: boolean;
    hasSeo: boolean;
    uploads: Array<{
      platform: string;
      status: string;
      platformVideoId: string | null;
      platformUrl: string | null;
    }>;
  };
  updatedAt: string;
}

export const pipelineApi = {
  run: (episodeId: string, uploadToYoutube = false) =>
    request<{ episodeId: string; message: string }>(`/episodes/${episodeId}/pipeline/run`, {
      method: 'POST',
      body: JSON.stringify({ uploadToYoutube }),
    }),

  runSync: (episodeId: string, uploadToYoutube = false) =>
    request<{ episodeId: string; steps: unknown[]; finalStatus: string; success: boolean }>(
      `/episodes/${episodeId}/pipeline/run/sync`,
      { method: 'POST', body: JSON.stringify({ uploadToYoutube }) },
    ),

  status: (episodeId: string) =>
    request<PipelineStatus>(`/episodes/${episodeId}/pipeline/status`),

  cancel: (episodeId: string) =>
    request<{ episodeId: string; cancelled: boolean }>(`/episodes/${episodeId}/pipeline/cancel`, {
      method: 'POST',
    }),
};

export interface PipelineLogEntry {
  ts: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

/**
 * Opens an EventSource subscription to an episode's live pipeline logs.
 * Returns a cleanup function that closes the connection.
 */
export function streamPipelineLogs(
  episodeId: string,
  onEntry: (entry: PipelineLogEntry) => void,
): () => void {
  const source = new EventSource(`${BASE_URL}/episodes/${episodeId}/pipeline/logs/stream`);

  source.onmessage = (event) => {
    onEntry(JSON.parse(event.data) as PipelineLogEntry);
  };

  return () => source.close();
}

// ── Scheduler ─────────────────────────────────────────────────────────────

export interface SchedulerStatus {
  scheduler: {
    lastRunAt: string | null;
    totalTriggered: number;
  };
}

export interface TriggerNextResult {
  storyId: string;
  episodeId: string;
  episodeNumber: number;
  resumed: boolean;
}

export const schedulerApi = {
  status: () => request<SchedulerStatus>('/scheduler/status'),
  triggerNext: (storyId: string) =>
    request<TriggerNextResult>('/scheduler/trigger-next', {
      method: 'POST',
      body: JSON.stringify({ storyId }),
    }),
};

// ── Analytics ─────────────────────────────────────────────────────────────

export interface EpisodeAnalytics {
  episodeId: string;
  platformVideoId: string;
  platform: string;
  latest: {
    views: number;
    likes: number;
    comments: number;
    saves: number;
    collectedAt: string;
  } | null;
  history: Array<{ views: number; likes: number; comments: number; collectedAt: string }>;
}

export interface AnalyticsSummary {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  snapshotCount: number;
}

export const analyticsApi = {
  getEpisodeAnalytics: (episodeId: string) =>
    request<EpisodeAnalytics | null>(`/episodes/${episodeId}/analytics`),

  collectForEpisode: (episodeId: string) =>
    request<{ views: number; likes: number; comments: number; saves: number; collectedAt: string }>(
      `/episodes/${episodeId}/analytics/collect`,
      { method: 'POST' },
    ),

  getSummary: () => request<AnalyticsSummary>('/analytics/summary'),
};

// ── Health ────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: string;
  services: Record<string, { status: string; latencyMs?: number }>;
}

export const healthApi = {
  check: () =>
    fetch(`${API_ORIGIN}/health`)
      .then((r) => r.json())
      .then((body) => body.data as { status: string; services: HealthStatus['services'] }),
};

// ── Settings ──────────────────────────────────────────────────────────────

export const settingsApi = {
  /** Fetches the Google consent-screen URL — caller opens it (new tab), Google shows a code on-screen to paste back in. */
  getYouTubeAuthUrl: () => request<{ url: string }>('/settings/youtube/auth-url'),

  /** Exchanges the code the user pasted from Google's consent page and persists the new refresh token. */
  exchangeYouTubeCode: (code: string) =>
    request<{ reconnected: boolean }>('/settings/youtube/exchange-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  youtubeStatus: () =>
    request<{ configured: boolean; ok: boolean; message?: string }>('/settings/youtube/status'),
};

// ── Clip Forge ────────────────────────────────────────────────────────────

export interface ClipForgeProject {
  id: string;
  userId: string;
  sourceUrl: string;
  sourceVideoId: string;
  sourceTitle: string;
  sourceDuration: number | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceFps: number | null;
  sourceStoragePath: string | null;
  targetShortDuration: number;
  totalParts: number;
  status: string;
  continuityValidated: boolean;
  lastSuccessfulPartNumber: number | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
}

export interface ClipForgePart {
  id: string;
  projectId: string;
  partNumber: number;
  partLabel: string;
  totalParts: number;
  startTime: number;
  endTime: number;
  duration: number;
  seoTitle: string | null;
  description: string | null;
  status: string;
  youtubeVideoId: string | null;
  youtubeVideoUrl: string | null;
  uploadAttempts: number;
  lastUploadError: string | null;
  uploadedAt: string | null;
}

export interface ClipForgeContinuityValidation {
  valid: boolean;
  sourceDuration: number;
  coveredDuration: number;
  missingRanges: Array<{ start: number; end: number }>;
  overlapRanges: Array<{ start: number; end: number }>;
  duplicateRanges: Array<{ start: number; end: number }>;
}

export interface ClipForgeStatus {
  project: ClipForgeProject;
  parts: ClipForgePart[];
  isRunning: boolean;
  uploadedCount: number;
  currentPartNumber: number | null;
  latestContinuityValidation: ClipForgeContinuityValidation | null;
}

export const clipForgeApi = {
  list: (page = 1, limit = 50) =>
    request<{ data: ClipForgeProject[]; total: number; page: number; limit: number }>(
      `/clip-forge/projects?page=${page}&limit=${limit}&userId=${SYSTEM_USER_ID}`,
    ),

  create: (payload: { youtubeUrl: string; ownershipConfirmed: boolean }) =>
    request<ClipForgeProject>('/clip-forge/projects', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userId: SYSTEM_USER_ID }),
    }),

  get: (projectId: string) =>
    request<ClipForgeStatus>(`/clip-forge/projects/${projectId}?userId=${SYSTEM_USER_ID}`),

  parts: (projectId: string) =>
    request<ClipForgePart[]>(`/clip-forge/projects/${projectId}/parts?userId=${SYSTEM_USER_ID}`),

  start: (projectId: string) =>
    request<{ projectId: string; message: string }>(`/clip-forge/projects/${projectId}/start`, {
      method: 'POST',
      body: JSON.stringify({ userId: SYSTEM_USER_ID }),
    }),

  pause: (projectId: string) =>
    request<{ projectId: string; cancelled: boolean }>(`/clip-forge/projects/${projectId}/pause`, {
      method: 'POST',
      body: JSON.stringify({ userId: SYSTEM_USER_ID }),
    }),

  resume: (projectId: string) =>
    request<{ projectId: string; message: string }>(`/clip-forge/projects/${projectId}/resume`, {
      method: 'POST',
      body: JSON.stringify({ userId: SYSTEM_USER_ID }),
    }),

  retry: (projectId: string) =>
    request<{ projectId: string; message: string }>(`/clip-forge/projects/${projectId}/retry`, {
      method: 'POST',
      body: JSON.stringify({ userId: SYSTEM_USER_ID }),
    }),

  remove: (projectId: string) =>
    request<{ projectId: string; deleted: boolean }>(`/clip-forge/projects/${projectId}?userId=${SYSTEM_USER_ID}`, {
      method: 'DELETE',
    }),
};


