import type { Episode, Scene, EpisodeStatus } from '@prisma/client';
import { BaseRepository, type FindManyOptions, type PaginatedResult } from './base.repository.js';
export interface CreateEpisodeInput {
    storyId: string;
    episodeNumber: number;
    title: string;
    content: string;
    hook: string;
    cliffhanger: string;
    duration?: number;
}
export interface CreateSceneInput {
    episodeId: string;
    sceneNumber: number;
    description: string;
    narration: string;
    mood: string;
    duration: number;
    characters: string[];
    location?: string;
}
export type EpisodeWithScenes = Episode & {
    scenes: Scene[];
};
export declare class EpisodeRepository extends BaseRepository {
    constructor();
    create(input: CreateEpisodeInput): Promise<Episode>;
    createScenes(scenes: CreateSceneInput[]): Promise<Scene[]>;
    findById(id: string): Promise<EpisodeWithScenes | null>;
    findByStoryId(storyId: string, options?: FindManyOptions): Promise<PaginatedResult<Episode>>;
    findLatestByStoryId(storyId: string): Promise<Episode | null>;
    update(id: string, data: Partial<{
        title: string;
        content: string;
        hook: string;
        cliffhanger: string;
        duration: number;
    }>): Promise<Episode>;
    updateStatus(id: string, status: EpisodeStatus, processingError?: string): Promise<Episode>;
    getNextEpisodeNumber(storyId: string): Promise<number>;
    findPendingEpisodes(): Promise<Episode[]>;
    findFailedEpisodes(): Promise<Episode[]>;
}
//# sourceMappingURL=episode.repository.d.ts.map