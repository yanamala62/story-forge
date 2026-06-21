import type { Platform, QueueName } from './enums.js';

export interface EpisodePipelineJobData {
  storyId: string;
  episodeId: string;
  episodeNumber: number;
  triggeredBy: 'scheduler' | 'manual' | 'api';
  timestamp: string;
}

export interface StoryGenerationJobData {
  storyId: string;
  episodeId: string;
  episodeNumber: number;
}

export interface SceneGenerationJobData {
  storyId: string;
  episodeId: string;
}

export interface PromptGenerationJobData {
  storyId: string;
  episodeId: string;
  sceneIds: string[];
}

export interface ImageGenerationJobData {
  episodeId: string;
  promptId: string;
  sceneId: string;
  sceneNumber: number;
}

export interface NarrationJobData {
  episodeId: string;
  narrationText: string;
  outputPath: string;
}

export interface SubtitleJobData {
  episodeId: string;
  audioPath: string;
  outputPath: string;
}

export interface VideoCompositionJobData {
  episodeId: string;
  sceneImagePaths: Array<{ sceneNumber: number; imagePath: string; duration: number }>;
  audioPath: string;
  subtitlePath: string;
  outputPath: string;
}

export interface SeoGenerationJobData {
  episodeId: string;
  videoId: string;
  storyTitle: string;
  episodeTitle: string;
  episodeContent: string;
}

export interface UploadJobData {
  videoId: string;
  episodeId: string;
  platforms: Platform[];
  videoPath: string;
  thumbnailPath?: string;
  seoMetadataId: string;
}

export interface AnalyticsCollectionJobData {
  uploadId: string;
  platform: Platform;
  platformVideoId: string;
}

export interface JobOptions {
  queue: QueueName;
  jobId?: string;
  delay?: number;
  priority?: number;
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  removeOnComplete?: number | boolean;
  removeOnFail?: number | boolean;
}

export type AnyJobData =
  | EpisodePipelineJobData
  | StoryGenerationJobData
  | SceneGenerationJobData
  | PromptGenerationJobData
  | ImageGenerationJobData
  | NarrationJobData
  | SubtitleJobData
  | VideoCompositionJobData
  | SeoGenerationJobData
  | UploadJobData
  | AnalyticsCollectionJobData;
