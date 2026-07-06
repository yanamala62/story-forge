import { z } from 'zod';
import { LLMValidationError } from '@storyforge/shared';

const SceneSchema = z.object({
  sceneNumber: z.number().int().positive(),
  description: z.string().min(10),
  narration: z.string().min(5).max(200),
  mood: z.enum(['tense', 'dramatic', 'mysterious', 'action', 'warm', 'sad', 'exciting', 'eerie']),
  duration: z.number().positive(),
  characters: z.array(z.string()),
  location: z.string(),
});

const NewCharacterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(5),
  visualDescription: z.string().min(10),
  personality: z.string().min(5),
  role: z.enum(['protagonist', 'antagonist', 'supporting', 'mentor', 'comic_relief']),
});

const NewLocationSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(5),
  visualDescription: z.string().min(10),
});

const WorldStateChangesSchema = z.object({
  currentTension: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  currentLocation: z.string().optional(),
  activeConflicts: z.array(z.string()).optional(),
  resolvedConflicts: z.array(z.string()).optional(),
  pendingCliffhangers: z.array(z.string()).optional(),
});

const MemoryUpdatesSchema = z.object({
  keyEvents: z.array(z.string()),
  worldStateChanges: WorldStateChangesSchema,
  resolvedCliffhanger: z.string().nullable().optional(),
});

export const GeneratedEpisodeSchema = z.object({
  title: z.string().min(3),
  hook: z.string().min(10),
  cliffhanger: z.string().min(10),
  content: z.string().min(50),
  scenes: z
    .array(SceneSchema)
    .min(3)
    .max(6)
    .transform((scenes) =>
      scenes.map((s, i) => ({ ...s, sceneNumber: i + 1 })),
    ),
  newCharacters: z.array(NewCharacterSchema).default([]),
  newLocations: z.array(NewLocationSchema).default([]),
  memoryUpdates: MemoryUpdatesSchema,
});

export type ValidatedGeneratedEpisode = z.infer<typeof GeneratedEpisodeSchema>;

export function validateGeneratedEpisode(raw: unknown): ValidatedGeneratedEpisode {
  const result = GeneratedEpisodeSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new LLMValidationError(`Generated episode failed validation: ${issues}`, {
      issues: result.error.issues,
    });
  }

  return result.data;
}

export function normalizeDurations(
  scenes: ValidatedGeneratedEpisode['scenes'],
  totalDuration: number,
): ValidatedGeneratedEpisode['scenes'] {
  const perScene = Math.floor(totalDuration / scenes.length);
  const remainder = totalDuration - perScene * scenes.length;

  return scenes.map((scene, i) => ({
    ...scene,
    duration: i === scenes.length - 1 ? perScene + remainder : perScene,
  }));
}
