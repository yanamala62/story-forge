export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  VIEWER = 'VIEWER',
}

export enum StoryGenre {
  ACTION = 'ACTION',
  ADVENTURE = 'ADVENTURE',
  ROMANCE = 'ROMANCE',
  HORROR = 'HORROR',
  MYSTERY = 'MYSTERY',
  FANTASY = 'FANTASY',
  SCI_FI = 'SCI_FI',
  DRAMA = 'DRAMA',
  COMEDY = 'COMEDY',
  THRILLER = 'THRILLER',
}

export enum ImageStyle {
  ANIME = 'ANIME',
  CARTOON = 'CARTOON',
  CINEMATIC = 'CINEMATIC',
  REALISTIC = 'REALISTIC',
}

export enum EpisodeStatus {
  PENDING = 'PENDING',
  GENERATING_STORY = 'GENERATING_STORY',
  GENERATING_SCENES = 'GENERATING_SCENES',
  GENERATING_PROMPTS = 'GENERATING_PROMPTS',
  GENERATING_IMAGES = 'GENERATING_IMAGES',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  GENERATING_SUBTITLES = 'GENERATING_SUBTITLES',
  COMPOSING_VIDEO = 'COMPOSING_VIDEO',
  GENERATING_SEO = 'GENERATING_SEO',
  UPLOADING = 'UPLOADING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
}

export enum ImageStatus {
  PENDING = 'PENDING',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum AudioStatus {
  PENDING = 'PENDING',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum SubtitleStatus {
  PENDING = 'PENDING',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum SubtitleFormat {
  SRT = 'SRT',
  VTT = 'VTT',
  ASS = 'ASS',
}

export enum VideoStatus {
  PENDING = 'PENDING',
  COMPOSING = 'COMPOSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum Platform {
  YOUTUBE = 'YOUTUBE',
  INSTAGRAM = 'INSTAGRAM',
  TIKTOK = 'TIKTOK',
  FACEBOOK = 'FACEBOOK',
}

export enum UploadStatus {
  PENDING = 'PENDING',
  UPLOADING = 'UPLOADING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
  SCHEDULED = 'SCHEDULED',
}

export enum PromptType {
  SCENE = 'SCENE',
  CHARACTER = 'CHARACTER',
  THUMBNAIL = 'THUMBNAIL',
}

export enum JobStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DELAYED = 'DELAYED',
  PAUSED = 'PAUSED',
}

export enum QueueName {
  EPISODE_PIPELINE = 'episode-pipeline',
  STORY_GENERATION = 'story-generation',
  SCENE_GENERATION = 'scene-generation',
  PROMPT_GENERATION = 'prompt-generation',
  IMAGE_GENERATION = 'image-generation',
  NARRATION_GENERATION = 'narration-generation',
  SUBTITLE_GENERATION = 'subtitle-generation',
  VIDEO_COMPOSITION = 'video-composition',
  SEO_GENERATION = 'seo-generation',
  UPLOAD = 'upload',
  ANALYTICS = 'analytics',
}
