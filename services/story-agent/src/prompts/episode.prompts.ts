import type { StoryMemory, StoryCharacter, StoryMemoryTimeline } from '@storyforge/shared';
import type { StoryGenre, ImageStyle } from '@storyforge/shared';

export interface EpisodePromptContext {
  storyTitle: string;
  genre: StoryGenre;
  style: ImageStyle;
  synopsis: string;
  episodeNumber: number;
  previousEpisodeSummary?: string;
  characters: StoryCharacter[];
  memory: StoryMemory;
  targetDurationSeconds: number;
  maxScenes: number;
}

const NEGATIVE_CONTENT_RULES = `
STRICT CONTENT RULES (never violate):
- Family friendly — suitable for ages 13+
- No explicit violence, gore, or sexual content
- No copyrighted characters or brands
- No real people
- No offensive stereotypes
`.trim();

const JSON_STRUCTURE = `
Return ONLY valid JSON (no markdown, no explanation) matching this exact structure:
{
  "title": "Episode title (compelling, 5-10 words)",
  "hook": "Opening sentence that grabs attention immediately (1-2 sentences)",
  "cliffhanger": "Ending cliffhanger that makes viewers want the next episode (1-2 sentences)",
  "content": "Full combined narration text of all scenes (all scenes joined)",
  "scenes": [
    {
      "sceneNumber": 1,
      "description": "Detailed visual description for image generation (what is shown, art style, lighting, composition, NO text in image)",
      "narration": "Voice-over text for this scene (12-15 words MAX — must fit in ~6 seconds of speech)",
      "mood": "one of: tense | dramatic | mysterious | action | warm | sad | exciting | eerie",
      "duration": 7,
      "characters": ["Character Name"],
      "location": "Location name"
    }
  ],
  "newCharacters": [
    {
      "name": "Full name",
      "description": "Who they are and their role",
      "visualDescription": "Detailed physical appearance for image generation (hair, eyes, clothing, build, distinguishing features)",
      "personality": "Core personality traits",
      "role": "protagonist | antagonist | supporting | mentor | comic_relief"
    }
  ],
  "newLocations": [
    {
      "name": "Location name",
      "description": "What this place is",
      "visualDescription": "Detailed visual description for image generation (architecture, lighting, atmosphere, colors)"
    }
  ],
  "memoryUpdates": {
    "keyEvents": ["Key event 1", "Key event 2"],
    "worldStateChanges": {
      "currentTension": "low | medium | high | critical",
      "currentLocation": "where the characters are now",
      "activeConflicts": ["ongoing conflict"],
      "resolvedConflicts": [],
      "pendingCliffhangers": ["the new cliffhanger set up in this episode"]
    },
    "resolvedCliffhanger": "null or the previous cliffhanger that gets resolved"
  }
}
`.trim();

export function buildFirstEpisodePrompt(ctx: EpisodePromptContext): string {
  const characterList =
    ctx.characters.length > 0
      ? ctx.characters.map((c) => `- ${c.name}: ${c.description}`).join('\n')
      : 'No characters defined yet — introduce the protagonist in this episode.';

  return `You are a master storyteller creating the first episode of an engaging ${ctx.genre.toLowerCase()} anime/cinematic story for a young adult audience (ages 13-35).

STORY DETAILS:
Title: "${ctx.storyTitle}"
Genre: ${ctx.genre}
Visual Style: ${ctx.style} (anime/cinematic)
Synopsis: ${ctx.synopsis}
Episode Number: 1
Total Duration: ${ctx.targetDurationSeconds} seconds (${ctx.maxScenes} scenes, ~${Math.round(ctx.targetDurationSeconds / ctx.maxScenes)} seconds each)

EXISTING CHARACTERS:
${characterList}

STORYTELLING RULES:
- Start with an attention-grabbing hook in the first scene
- Build tension progressively across scenes
- End with a strong cliffhanger that demands a next episode
- Each scene narration must be 12-15 words MAX (fits ~6 seconds of speech)
- Total narration across all scenes = ${ctx.targetDurationSeconds} seconds of speech
- Create ${ctx.maxScenes} scenes exactly
- Scene descriptions must be detailed enough for AI image generation
- Maintain the ${ctx.style.toLowerCase()} visual style throughout
- Include diverse, original characters with unique visual appearances

${NEGATIVE_CONTENT_RULES}

${JSON_STRUCTURE}`;
}

export function buildContinuationEpisodePrompt(ctx: EpisodePromptContext): string {
  const characterList = ctx.characters
    .map(
      (c) =>
        `- ${c.name} (${c.role}): ${c.description} | Visual: ${c.visualDescription}${!c.isAlive ? ' [DECEASED — do not use]' : ''}`,
    )
    .join('\n');

  const recentTimeline = ctx.memory.timeline
    .slice(-3)
    .map((t: StoryMemoryTimeline) => `Episode ${t.episodeNumber}: ${t.summary}`)
    .join('\n');

  const pendingCliffhangers = (ctx.memory.worldState.pendingCliffhangers ?? []).join('\n- ');
  const activeConflicts = (ctx.memory.worldState.activeConflicts ?? []).join(', ');

  return `You are a master storyteller writing Episode ${ctx.episodeNumber} of an ongoing ${ctx.genre.toLowerCase()} anime/cinematic story.

STORY DETAILS:
Title: "${ctx.storyTitle}"
Genre: ${ctx.genre}
Visual Style: ${ctx.style}
Episode Number: ${ctx.episodeNumber}
Total Duration: ${ctx.targetDurationSeconds} seconds (${ctx.maxScenes} scenes)

RECENT STORY HISTORY:
${recentTimeline || 'First few episodes — story just began.'}

CURRENT WORLD STATE:
- Location: ${ctx.memory.worldState.currentLocation || 'Unknown'}
- Tension Level: ${ctx.memory.worldState.currentTension || 'medium'}
- Active Conflicts: ${activeConflicts || 'None yet'}
- Unresolved Cliffhanger from last episode:
  ${pendingCliffhangers ? `- ${pendingCliffhangers}` : 'None'}

ESTABLISHED CHARACTERS (never rename or alter appearance):
${characterList || 'No characters yet.'}

KEY PLOT POINTS TO REMEMBER:
${ctx.memory.plotPoints.slice(-5).map((p) => `- ${p}`).join('\n') || '- Story is just beginning'}

STORYTELLING RULES:
- RESOLVE the previous cliffhanger in the first 1-2 scenes
- Continue naturally from where Episode ${ctx.episodeNumber - 1} ended
- Build new tension and introduce new plot developments
- End with a NEW cliffhanger stronger than the last
- Each scene narration: 12-15 words MAX (~6 seconds of speech)
- Create exactly ${ctx.maxScenes} scenes
- Character appearances must stay EXACTLY consistent with their visual descriptions
- Never kill a main character without extreme narrative justification
- Advance the main conflict meaningfully

${NEGATIVE_CONTENT_RULES}

${JSON_STRUCTURE}`;
}

export function buildMemoryUpdatePrompt(
  episodeContent: string,
  existingMemory: StoryMemory,
): string {
  return `Summarize this story episode into a memory entry for future reference.

EPISODE CONTENT:
${episodeContent}

EXISTING MEMORY CONTEXT:
${JSON.stringify(existingMemory, null, 2)}

Return ONLY valid JSON:
{
  "summary": "2-3 sentence summary of what happened",
  "keyEvents": ["event 1", "event 2", "event 3"]
}`;
}
