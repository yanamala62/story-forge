export { prisma, connectDatabase, disconnectDatabase, checkDatabaseHealth } from './client.js';
export { BaseRepository } from './repositories/base.repository.js';
export type { FindManyOptions, PaginatedResult } from './repositories/base.repository.js';
export { StoryRepository } from './repositories/story.repository.js';
export type { CreateStoryInput, UpdateStoryInput, StoryWithDetails } from './repositories/story.repository.js';
export { EpisodeRepository } from './repositories/episode.repository.js';
export type { CreateEpisodeInput, CreateSceneInput, EpisodeWithScenes } from './repositories/episode.repository.js';
export { CharacterRepository } from './repositories/character.repository.js';
export type { CreateCharacterInput } from './repositories/character.repository.js';
export { MemoryRepository } from './repositories/memory.repository.js';
export { AudioRepository } from './repositories/audio.repository.js';
export type { CreateAudioFileInput } from './repositories/audio.repository.js';
export { SubtitleRepository } from './repositories/subtitle.repository.js';
export type { CreateSubtitleFileInput } from './repositories/subtitle.repository.js';
export { PromptRepository } from './repositories/prompt.repository.js';
export type { CreatePromptInput } from './repositories/prompt.repository.js';
export { ImageRepository } from './repositories/image.repository.js';
export type { CreateGeneratedImageInput } from './repositories/image.repository.js';
export { VideoRepository } from './repositories/video.repository.js';
export type { CreateVideoInput } from './repositories/video.repository.js';

// Re-export Prisma types for convenience
export type {
  User,
  Story,
  StoryMemory,
  Episode,
  Scene,
  Character,
  Location,
  Prompt,
  GeneratedImage,
  AudioFile,
  SubtitleFile,
  Video,
  SeoMetadata,
  Upload,
  Analytics,
  Setting,
  QueueJob,
} from '@prisma/client';

export {
  UserRole,
  StoryGenre,
  ImageStyle,
  EpisodeStatus,
  ImageStatus,
  AudioStatus,
  SubtitleStatus,
  SubtitleFormat,
  VideoStatus,
  Platform,
  UploadStatus,
  PromptType,
  JobStatus,
} from '@prisma/client';
