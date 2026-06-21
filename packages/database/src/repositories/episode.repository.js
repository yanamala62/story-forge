"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EpisodeRepository = void 0;
const base_repository_js_1 = require("./base.repository.js");
class EpisodeRepository extends base_repository_js_1.BaseRepository {
    constructor() {
        super('episode-repository');
    }
    async create(input) {
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
    async createScenes(scenes) {
        const created = await this.db.$transaction(scenes.map((scene) => this.db.scene.create({
            data: {
                episodeId: scene.episodeId,
                sceneNumber: scene.sceneNumber,
                description: scene.description,
                narration: scene.narration,
                mood: scene.mood,
                duration: scene.duration,
                characters: scene.characters,
                location: scene.location,
            },
        })));
        this.logger.info('Scenes created', {
            episodeId: scenes[0]?.episodeId,
            count: created.length,
        });
        return created;
    }
    async findById(id) {
        return this.db.episode.findUnique({
            where: { id },
            include: {
                scenes: { orderBy: { sceneNumber: 'asc' } },
            },
        });
    }
    async findByStoryId(storyId, options = {}) {
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
    async findLatestByStoryId(storyId) {
        return this.db.episode.findFirst({
            where: { storyId },
            orderBy: { episodeNumber: 'desc' },
        });
    }
    async update(id, data) {
        return this.db.episode.update({ where: { id }, data });
    }
    async updateStatus(id, status, processingError) {
        return this.db.episode.update({
            where: { id },
            data: {
                status,
                ...(processingError !== undefined && { processingError }),
            },
        });
    }
    async getNextEpisodeNumber(storyId) {
        const latest = await this.findLatestByStoryId(storyId);
        return (latest?.episodeNumber ?? 0) + 1;
    }
    async findPendingEpisodes() {
        return this.db.episode.findMany({
            where: { status: 'PENDING' },
            orderBy: { createdAt: 'asc' },
            take: 10,
        });
    }
    async findFailedEpisodes() {
        return this.db.episode.findMany({
            where: { status: 'FAILED' },
            orderBy: { updatedAt: 'desc' },
            take: 20,
        });
    }
}
exports.EpisodeRepository = EpisodeRepository;
//# sourceMappingURL=episode.repository.js.map