import type { StoryMemory } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
import type { StoryMemory as StoryMemoryType } from '@storyforge/shared';

export class MemoryRepository extends BaseRepository {
  constructor() {
    super('memory-repository');
  }

  async findByStoryId(storyId: string): Promise<StoryMemory | null> {
    return this.db.storyMemory.findUnique({ where: { storyId } });
  }

  async upsert(storyId: string, memory: StoryMemoryType): Promise<StoryMemory> {
    const updated = await this.db.storyMemory.upsert({
      where: { storyId },
      update: {
        timeline: memory.timeline as object[],
        worldState: memory.worldState as object,
        plotPoints: memory.plotPoints as string[],
      },
      create: {
        storyId,
        timeline: memory.timeline as object[],
        worldState: memory.worldState as object,
        plotPoints: memory.plotPoints as string[],
      },
    });

    this.logger.debug('Story memory updated', {
      storyId,
      timelineEntries: memory.timeline.length,
      plotPoints: memory.plotPoints.length,
    });

    return updated;
  }
}
