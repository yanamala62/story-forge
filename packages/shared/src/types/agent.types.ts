export interface AgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  attempts: number;
}

export interface AgentConfig {
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
}

export interface WhisperTranscription {
  text: string;
  segments: WhisperSegment[];
  language: string;
}

export interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface SRTEntry {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

export interface VideoCompositionConfig {
  episodeId: string;
  scenes: VideoScene[];
  audioPath: string;
  subtitlePath: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  backgroundMusicPath?: string;
}

export interface VideoScene {
  sceneNumber: number;
  imagePath: string;
  duration: number;
  transition?: 'fade' | 'zoom' | 'slide' | 'none';
  zoomEffect?: 'in' | 'out' | 'none';
}

export interface SeoOutput {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  category: string;
}

export interface UploadResult {
  platform: string;
  platformVideoId: string;
  platformUrl: string;
  publishedAt: string;
}

export interface AnalyticsData {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  watchTime: number;
  avgRetention: number;
  ctr: number;
  impressions: number;
}
