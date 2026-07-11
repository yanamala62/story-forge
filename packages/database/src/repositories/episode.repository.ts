import type { Episode, Scene, EpisodeStatus, Prisma } from '@prisma/client';
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

export type EpisodeWithScenes = Episode & { scenes: Scene[] };

export class EpisodeRepository extends BaseRepository {
  constructor() {
    super('episode-repository');
  }

  async create(input: CreateEpisodeInput): Promise<Episode> {
    const episode = await this.db.episode.create({
      data: {
        storyId: input.storyId,
        episodeNumber: input.episodeNumber,
        title: input.title,
        content: input.content,
        hook: input.hook,
        cliffhanger: input.cliffhanger,
        duration: input.duration ?? 40,
        status: 'PENDING',
      },
    });

    this.logger.info('Episode created', {
      episodeId: episode.id,
      storyId: input.storyId,
      episodeNumber: input.episodeNumber,
    });

    return episode;
  }

  async createScenes(scenes: CreateSceneInput[]): Promise<Scene[]> {
    const created = await this.db.$transaction(
      scenes.map((scene) =>
        this.db.scene.create({
          data: {
            episodeId: scene.episodeId,
            sceneNumber: scene.sceneNumber,
            description: scene.description,
            narration: scene.narration,
            mood: scene.mood,
            duration: scene.duration,
            characters: scene.characters,
            location: scene.location ?? null,
          },
        }),
      ),
    );

    this.logger.info('Scenes created', {
      episodeId: scenes[0]?.episodeId,
      count: created.length,
    });

    return created;
  }

  async findById(id: string): Promise<EpisodeWithScenes | null> {
    return this.db.episode.findUnique({
      where: { id },
      include: {
        scenes: { orderBy: { sceneNumber: 'asc' } },
      },
    });
  }

  async findByStoryId(
    storyId: string,
    options: FindManyOptions = {},
  ): Promise<PaginatedResult<Episode>> {
    const { skip, take } = this.buildPagination(options);

    const [data, total] = await Promise.all([
      this.db.episode.findMany({
        where: { storyId },
        orderBy: options.orderBy ?? { episodeNumber: 'desc' },
        skip,
        take,
      }),
      this.db.episode.count({ where: { storyId } }),
    ]);

    return this.buildPaginatedResult(data, total, options);
  }

  async findLatestByStoryId(storyId: string): Promise<Episode | null> {
    return this.db.episode.findFirst({
      where: { storyId },
      orderBy: { episodeNumber: 'desc' },
    });
  }

  async update(
    id: string,
    data: Partial<{ title: string; content: string; hook: string; cliffhanger: string; duration: number }>,
  ): Promise<Episode> {
    return this.db.episode.update({ where: { id }, data });
  }

  async updateStatus(
    id: string,
    status: EpisodeStatus,
    processingError?: string | null,
  ): Promise<Episode> {
    return this.db.episode.update({
      where: { id },
      data: {
        status,
        ...(processingError !== undefined && { processingError }),
      },
    });
  }

  async getNextEpisodeNumber(storyId: string): Promise<number> {
    const latest = await this.findLatestByStoryId(storyId);
    return (latest?.episodeNumber ?? 0) + 1;
  }

  async findPendingEpisodes(): Promise<Episode[]> {
    return this.db.episode.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
  }

  async findFailedEpisodes(): Promise<Episode[]> {
    return this.db.episode.findMany({
      where: { status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }

  /** Returns the most recent episode for a story that is currently being processed. */
  async findInFlightEpisode(storyId: string): Promise<Episode | null> {
    return this.db.episode.findFirst({
      where: {
        storyId,
        status: {
          notIn: ['PENDING', 'PUBLISHED', 'FAILED'],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Returns the most recent FAILED episode for a story, used by the scheduler for auto-retry. */
  async findLatestFailedEpisode(storyId: string): Promise<EpisodeWithScenes | null> {
    return this.db.episode.findFirst({
      where: { storyId, status: 'FAILED' },
      orderBy: { episodeNumber: 'desc' },
      include: { scenes: { orderBy: { sceneNumber: 'asc' } } },
    });
  }

  /**
   * Marks any episode left in a non-terminal (GENERATING_ / COMPOSING_VIDEO / UPLOADING)
   * status as FAILED. Meant to run once at API boot: the in-memory "running" tracking is
   * always empty right after a fresh process start, so any such episode is provably orphaned
   * (the previous process died mid-pipeline without a chance to mark it FAILED). Without
   * this, an orphaned episode blocks all future triggers for its story forever.
   */
  async reconcileOrphanedEpisodes(): Promise<number> {
    const result = await this.db.episode.updateMany({
      where: { status: { notIn: ['PENDING', 'PUBLISHED', 'FAILED'] } },
      data: { status: 'FAILED', processingError: 'Interrupted by server restart' },
    });
    return result.count;
  }

  /**
   * Full, unpaginated episode list for a story ordered newest-first by creation
   * time — used by EpisodeRetentionService to rank episodes for retention.
   * Deliberately not the paginated findByStoryId (capped at 100 per page).
   */
  async findAllByStoryId(storyId: string): Promise<Episode[]> {
    return this.db.episode.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Distinct storyIds that currently have more than `limit` episodes —
   * candidates for a retention pass (EpisodeRetentionService).
   */
  async findStoriesExceedingRetention(limit = 3): Promise<string[]> {
    const groups = await this.db.episode.groupBy({
      by: ['storyId'],
      _count: { _all: true },
      having: { storyId: { _count: { gt: limit } } },
    });
    return groups.map((g) => g.storyId);
  }
}
