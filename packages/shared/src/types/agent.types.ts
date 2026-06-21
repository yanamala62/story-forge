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

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaGenerateRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
  format?: 'json';
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export interface ComfyUIQueuePromptRequest {
  prompt: Record<string, ComfyUINode>;
  client_id?: string;
}

export interface ComfyUINode {
  class_type: string;
  inputs: Record<string, unknown>;
}

export interface ComfyUIQueuePromptResponse {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
}

export interface ComfyUIHistoryOutput {
  images: Array<{
    filename: string;
    subfolder: string;
    type: string;
  }>;
}

export interface PiperTTSRequest {
  text: string;
  voice?: string;
  outputPath: string;
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
