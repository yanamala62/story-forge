"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryRepository = void 0;
const base_repository_js_1 = require("./base.repository.js");
class MemoryRepository extends base_repository_js_1.BaseRepository {
    constructor() {
        super('memory-repository');
    }
    async findByStoryId(storyId) {
        return this.db.storyMemory.findUnique({ where: { storyId } });
    }
    async upsert(storyId, memory) {
        const updated = await this.db.storyMemory.upsert({
            where: { storyId },
            update: {
                timeline: memory.timeline,
                worldState: memory.worldState,
                plotPoints: memory.plotPoints,
            },
            create: {
                storyId,
                timeline: memory.timeline,
                worldState: memory.worldState,
                plotPoints: memory.plotPoints,
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
exports.MemoryRepository = MemoryRepository;
//# sourceMappingURL=memory.repository.js.map