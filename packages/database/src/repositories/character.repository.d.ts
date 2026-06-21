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
export declare class CharacterRepository extends BaseRepository {
    constructor();
    createMany(characters: CreateCharacterInput[]): Promise<Character[]>;
    findByStoryId(storyId: string): Promise<Character[]>;
    incrementAppearances(storyId: string, names: string[]): Promise<void>;
    markDeceased(storyId: string, name: string): Promise<void>;
}
//# sourceMappingURL=character.repository.d.ts.map