import type { Character } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export interface CreateCharacterInput {
  storyId: string;
  name: string;
  description: string;
  visualDescription: string;
  personality: string;
  role: string;
}

export class CharacterRepository extends BaseRepository {
  constructor() {
    super('character-repository');
  }

  async createMany(characters: CreateCharacterInput[]): Promise<Character[]> {
    const created = await this.db.$transaction(
      characters.map((c) =>
        this.db.character.upsert({
          where: { storyId_name: { storyId: c.storyId, name: c.name } },
          update: {
            description: c.description,
            visualDescription: c.visualDescription,
            personality: c.personality,
            role: c.role,
          },
          create: {
            storyId: c.storyId,
            name: c.name,
            description: c.description,
            visualDescription: c.visualDescription,
            personality: c.personality,
            role: c.role,
          },
        }),
      ),
    );

    this.logger.info('Characters upserted', {
      storyId: characters[0]?.storyId,
      count: created.length,
      names: created.map((c) => c.name),
    });

    return created;
  }

  async findByStoryId(storyId: string): Promise<Character[]> {
    return this.db.character.findMany({
      where: { storyId, isAlive: true },
      orderBy: { appearances: 'desc' },
    });
  }

  async incrementAppearances(storyId: string, names: string[]): Promise<void> {
    await this.db.character.updateMany({
      where: { storyId, name: { in: names } },
      data: { appearances: { increment: 1 } },
    });
  }

  async markDeceased(storyId: string, name: string): Promise<void> {
    await this.db.character.update({
      where: { storyId_name: { storyId, name } },
      data: { isAlive: false },
    });
  }
}
