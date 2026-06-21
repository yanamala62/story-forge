import type { Prompt } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export interface CreatePromptInput {
  episodeId: string;
  sceneId: string;
  positivePrompt: string;
  negativePrompt: string;
  style: string;
  characters: string[];
  location?: string | null;
  seed?: number;
}

export class PromptRepository extends BaseRepository {
  constructor() {
    super('prompt-repository');
  }

  async createMany(prompts: CreatePromptInput[]): Promise<Prompt[]> {
    const created = await this.db.$transaction(
      prompts.map((p) =>
        this.db.prompt.upsert({
          where: { sceneId: p.sceneId },
          update: {
            positivePrompt: p.positivePrompt,
            negativePrompt: p.negativePrompt,
            style: p.style,
            characters: p.characters,
            location: p.location ?? null,
          },
          create: {
            episodeId: p.episodeId,
            sceneId: p.sceneId,
            type: 'SCENE',
            positivePrompt: p.positivePrompt,
            negativePrompt: p.negativePrompt,
            style: p.style,
            characters: p.characters,
            location: p.location ?? null,
            model: 'pollinations-flux',
          },
        }),
      ),
    );

    this.logger.info('Prompts upserted', { episodeId: prompts[0]?.episodeId, count: created.length });
    return created;
  }

  async findByEpisodeId(episodeId: string): Promise<Prompt[]> {
    return this.db.prompt.findMany({
      where: { episodeId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findBySceneId(sceneId: string): Promise<Prompt | null> {
    return this.db.prompt.findUnique({ where: { sceneId } });
  }
}
