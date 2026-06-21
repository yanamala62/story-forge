import type { Story, Character, StoryMemory, Prisma } from '@prisma/client';
import { BaseRepository, type FindManyOptions, type PaginatedResult } from './base.repository.js';

export interface CreateStoryInput {
  userId: string;
  title: string;
  genre: Prisma.EnumStoryGenreFilter['equals'];
  style?: Prisma.EnumImageStyleFilter['equals'];
  synopsis: string;
  targetAudience?: string;
}

export type StoryWithDetails = Story & {
  characters: Character[];
  memory: StoryMemory | null;
  _count: { episodes: number };
};

export interface UpdateStoryInput {
  title?: string;
  synopsis?: string;
  isActive?: boolean;
}

export class StoryRepository extends BaseRepository {
  constructor() {
    super('story-repository');
  }

  async create(input: CreateStoryInput): Promise<Story> {
    const story = await this.db.story.create({
      data: {
        userId: input.userId,
        title: input.title,
        genre: input.genre as Story['genre'],
        style: (input.style ?? 'ANIME') as Story['style'],
        synopsis: input.synopsis,
        targetAudience: input.targetAudience ?? '13-35',
        memory: {
          create: {
            timeline: [],
            worldState: {
              currentTension: 'low',
              currentLocation: 'Unknown',
              activeConflicts: [],
              resolvedConflicts: [],
              pendingCliffhangers: [],
            },
            plotPoints: [],
          },
        },
      },
    });

    this.logger.info('Story created', { storyId: story.id, title: story.title });
    return story;
  }

  async findById(id: string): Promise<StoryWithDetails | null> {
    return this.db.story.findUnique({
      where: { id },
      include: {
        characters: { orderBy: { createdAt: 'asc' } },
        memory: true,
        _count: { select: { episodes: true } },
      },
    });
  }

  async findByUserId(
    userId: string,
    options: FindManyOptions = {},
  ): Promise<PaginatedResult<Story>> {
    const { skip, take } = this.buildPagination(options);

    const [data, total] = await Promise.all([
      this.db.story.findMany({
        where: { userId, isActive: true },
        orderBy: options.orderBy ?? { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.db.story.count({ where: { userId, isActive: true } }),
    ]);

    return this.buildPaginatedResult(data, total, options);
  }

  async findActiveStories(): Promise<Story[]> {
    return this.db.story.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'asc' },
    });
  }

  async update(id: string, input: UpdateStoryInput): Promise<Story> {
    return this.db.story.update({
      where: { id },
      data: { ...input, updatedAt: new Date() },
    });
  }

  async incrementEpisodeCount(id: string): Promise<Story> {
    return this.db.story.update({
      where: { id },
      data: { episodeCount: { increment: 1 } },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.db.story.update({
      where: { id },
      data: { isActive: false },
    });
    this.logger.info('Story soft deleted', { storyId: id });
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.db.story.count({ where: { id } });
    return count > 0;
  }
}
