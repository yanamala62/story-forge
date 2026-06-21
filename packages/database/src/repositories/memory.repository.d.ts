import type { StoryMemory } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
import type { StoryMemory as StoryMemoryType } from '@storyforge/shared';
export declare class MemoryRepository extends BaseRepository {
    constructor();
    findByStoryId(storyId: string): Promise<StoryMemory | null>;
    upsert(storyId: string, memory: StoryMemoryType): Promise<StoryMemory>;
}
//# sourceMappingURL=memory.repository.d.ts.map