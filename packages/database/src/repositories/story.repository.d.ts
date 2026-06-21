import type { Story, StoryGenre, ImageStyle } from '@prisma/client';
import { BaseRepository, type FindManyOptions, type PaginatedResult } from './base.repository.js';
export interface CreateStoryInput {
    userId: string;
    title: string;
    genre: StoryGenre;
    style?: ImageStyle;
    synopsis: string;
    targetAudience?: string;
}
export interface UpdateStoryInput {
    title?: string;
    synopsis?: string;
    isActive?: boolean;
}
export declare class StoryRepository extends BaseRepository {
    constructor();
    create(input: CreateStoryInput): Promise<Story>;
    findById(id: string): Promise<(Story & {
        characters: Awaited<ReturnType<typeof this.db.character.findMany>>;
        memory: Awaited<ReturnType<typeof this.db.storyMemory.findUnique>>;
        _count: {
            episodes: number;
        };
    }) | null>;
    findByUserId(userId: string, options?: FindManyOptions): Promise<PaginatedResult<Story>>;
    findActiveStories(): Promise<Story[]>;
    update(id: string, input: UpdateStoryInput): Promise<Story>;
    incrementEpisodeCount(id: string): Promise<Story>;
    softDelete(id: string): Promise<void>;
    exists(id: string): Promise<boolean>;
}
//# sourceMappingURL=story.repository.d.ts.map