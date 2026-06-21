import type { StoryMemory, StoryMemoryTimeline, StoryMemoryWorldState } from '@storyforge/shared';
import type { ValidatedGeneratedEpisode } from '../validators/episode.validator.js';

export function buildInitialMemory(): StoryMemory {
  return {
    timeline: [],
    worldState: {
      currentTension: 'low',
      currentLocation: 'Unknown',
      activeConflicts: [],
      resolvedConflicts: [],
      pendingCliffhangers: [],
    },
    plotPoints: [],
    characters: [],
    locations: [],
  };
}

export function applyEpisodeToMemory(
  existingMemory: StoryMemory,
  episode: ValidatedGeneratedEpisode,
  episodeNumber: number,
): StoryMemory {
  const { memoryUpdates } = episode;

  // Build timeline entry
  const timelineEntry: StoryMemoryTimeline = {
    episodeNumber,
    summary: episode.hook + ' ' + episode.cliffhanger,
    keyEvents: memoryUpdates.keyEvents,
    timestamp: new Date().toISOString(),
  };

  // Merge world state changes
  const currentWorldState = existingMemory.worldState;
  const changes = memoryUpdates.worldStateChanges ?? {};

  const updatedWorldState: StoryMemoryWorldState = {
    currentTension: changes.currentTension ?? currentWorldState.currentTension,
    currentLocation: changes.currentLocation ?? currentWorldState.currentLocation,
    activeConflicts: changes.activeConflicts ?? currentWorldState.activeConflicts,
    resolvedConflicts: [
      ...currentWorldState.resolvedConflicts,
      ...(changes.resolvedConflicts ?? []),
    ],
    pendingCliffhangers: changes.pendingCliffhangers ?? [episode.cliffhanger],
  };

  // Resolve previous cliffhanger if indicated
  if (
    memoryUpdates.resolvedCliffhanger &&
    memoryUpdates.resolvedCliffhanger !== 'null'
  ) {
    updatedWorldState.pendingCliffhangers = updatedWorldState.pendingCliffhangers.filter(
      (c) => c !== memoryUpdates.resolvedCliffhanger,
    );
  }

  // Build updated plot points (keep last 10)
  const updatedPlotPoints = [
    ...existingMemory.plotPoints,
    ...memoryUpdates.keyEvents,
  ].slice(-10);

  return {
    timeline: [...existingMemory.timeline, timelineEntry],
    worldState: updatedWorldState,
    plotPoints: updatedPlotPoints,
    characters: existingMemory.characters,
    locations: existingMemory.locations,
  };
}
