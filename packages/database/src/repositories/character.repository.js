"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CharacterRepository = void 0;
const base_repository_js_1 = require("./base.repository.js");
class CharacterRepository extends base_repository_js_1.BaseRepository {
    constructor() {
        super('character-repository');
    }
    async createMany(characters) {
        const created = await this.db.$transaction(characters.map((c) => this.db.character.upsert({
            where: { storyId_name: { storyId: c.storyId, name: c.name } },
            update: {
                description: c.description,
                visualDescription: c.visualDescription,
                personality: c.personality,
                role: c.role,
            },
            create: {
                storyId: c.storyId,
                name: c.name,
                description: c.description,
                visualDescription: c.visualDescription,
                personality: c.personality,
                role: c.role,
            },
        })));
        this.logger.info('Characters upserted', {
            storyId: characters[0]?.storyId,
            count: created.length,
            names: created.map((c) => c.name),
        });
        return created;
    }
    async findByStoryId(storyId) {
        return this.db.character.findMany({
            where: { storyId, isAlive: true },
            orderBy: { appearances: 'desc' },
        });
    }
    async incrementAppearances(storyId, names) {
        await this.db.character.updateMany({
            where: { storyId, name: { in: names } },
            data: { appearances: { increment: 1 } },
        });
    }
    async markDeceased(storyId, name) {
        await this.db.character.update({
            where: { storyId_name: { storyId, name } },
            data: { isAlive: false },
        });
    }
}
exports.CharacterRepository = CharacterRepository;
//# sourceMappingURL=character.repository.js.map