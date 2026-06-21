"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseRepository = void 0;
const shared_1 = require("@storyforge/shared");
const client_js_1 = require("../client.js");
class BaseRepository {
    db;
    logger;
    constructor(loggerName) {
        this.db = client_js_1.prisma;
        this.logger = (0, shared_1.createLogger)(loggerName);
    }
    buildPagination(options) {
        const page = Math.max(1, options.page ?? 1);
        const limit = Math.min(100, Math.max(1, options.limit ?? 20));
        return {
            skip: (page - 1) * limit,
            take: limit,
        };
    }
    buildPaginatedResult(data, total, options) {
        const page = Math.max(1, options.page ?? 1);
        const limit = Math.min(100, Math.max(1, options.limit ?? 20));
        const totalPages = Math.ceil(total / limit);
        return {
            data,
            total,
            page,
            limit,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        };
    }
}
exports.BaseRepository = BaseRepository;
//# sourceMappingURL=base.repository.js.map