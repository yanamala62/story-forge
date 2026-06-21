import type { EpisodeStatus, ImageStyle, StoryGenre } from './enums.js';

export interface StoryCharacter {
  id: string;
  name: string;
  description: string;
  visualDescription: string;
  personality: string;
  role: string;
  isAlive: boolean;
}

export interface StoryLocation {
  id: string;
  name: string;
  description: string;
  visualDescription: string;
}

export interface StoryMemoryTimeline {
  episodeNumber: number;
  summary: string;
  keyEvents: string[];
  timestamp: string;
}

export interface StoryMemoryWorldState {
  currentTension: 'low' | 'medium' | 'high' | 'critical';
  currentLocation: string;
  activeConflicts: string[];
  resolvedConflicts: string[];
  pendingCliffhangers: string[];
}

export interface StoryMemory {
  timeline: StoryMemoryTimeline[];
  worldState: StoryMemoryWorldState;
  plotPoints: string[];
  characters: StoryCharacter[];
  locations: StoryLocation[];
}

export interface GeneratedScene {
  sceneNumber: number;
  description: string;
  narration: string;
  mood: string;
  duration: number;
  characters: string[];
  location: string;
}

export interface GeneratedEpisode {
  title: string;
  content: string;
  hook: string;
  cliffhanger: string;
  scenes: GeneratedScene[];
  newCharacters: Omit<StoryCharacter, 'id'>[];
  newLocations: Omit<StoryLocation, 'id'>[];
  memoryUpdates: {
    keyEvents: string[];
    worldStateChanges: Partial<StoryMemoryWorldState>;
    resolvedCliffhanger?: string;
  };
}

export interface EpisodePipelineContext {
  storyId: string;
  episodeId: string;
  episodeNumber: number;
  status: EpisodeStatus;
  startedAt: string;
  story: {
    title: string;
    genre: StoryGenre;
    style: ImageStyle;
    synopsis: string;
  };
  memory: StoryMemory;
}

export interface ScenePromptContext {
  scene: GeneratedScene;
  characters: StoryCharacter[];
  location?: StoryLocation;
  style: ImageStyle;
  genre: StoryGenre;
  consistencyTags: string[];
}

export interface ImagePrompt {
  sceneId: string;
  sceneNumber: number;
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  style: ImageStyle;
}
