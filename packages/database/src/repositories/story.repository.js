"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoryRepository = void 0;
const base_repository_js_1 = require("./base.repository.js");
class StoryRepository extends base_repository_js_1.BaseRepository {
    constructor() {
        super('story-repository');
    }
    async create(input) {
        const story = await this.db.story.create({
            data: {
                userId: input.userId,
                title: input.title,
                genre: input.genre,
                style: input.style ?? 'ANIME',
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
    async findById(id) {
        return this.db.story.findUnique({
            where: { id },
            include: {
                characters: { orderBy: { createdAt: 'asc' } },
                memory: true,
                _count: { select: { episodes: true } },
            },
        });
    }
    async findByUserId(userId, options = {}) {
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
    async findActiveStories() {
        return this.db.story.findMany({
            where: { isActive: true },
            orderBy: { updatedAt: 'asc' },
        });
    }
    async update(id, input) {
        return this.db.story.update({
            where: { id },
            data: {
                ...input,
                updatedAt: new Date(),
            },
        });
    }
    async incrementEpisodeCount(id) {
        return this.db.story.update({
            where: { id },
            data: { episodeCount: { increment: 1 } },
        });
    }
    async softDelete(id) {
        await this.db.story.update({
            where: { id },
            data: { isActive: false },
        });
        this.logger.info('Story soft deleted', { storyId: id });
    }
    async exists(id) {
        const count = await this.db.story.count({ where: { id } });
        return count > 0;
    }
}
exports.StoryRepository = StoryRepository;
//# sourceMappingURL=story.repository.js.map