"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.connectDatabase = connectDatabase;
exports.disconnectDatabase = disconnectDatabase;
exports.checkDatabaseHealth = checkDatabaseHealth;
const client_1 = require("@prisma/client");
const shared_1 = require("@storyforge/shared");
const logger = (0, shared_1.createLogger)('prisma');
function createPrismaClient() {
    return new client_1.PrismaClient({
        log: [
            { level: 'query', emit: 'event' },
            { level: 'error', emit: 'event' },
            { level: 'warn', emit: 'event' },
        ],
    });
}
exports.prisma = process.env['NODE_ENV'] === 'production'
    ? createPrismaClient()
    : (globalThis.__prismaClient ??= createPrismaClient());
exports.prisma.$on('error', (e) => {
    logger.error('Prisma error', { target: e.target, message: e.message });
});
exports.prisma.$on('warn', (e) => {
    logger.warn('Prisma warning', { target: e.target, message: e.message });
});
if (process.env['NODE_ENV'] === 'development') {
    exports.prisma.$on('query', (e) => {
        if (e.duration > 1000) {
            logger.warn('Slow query detected', { query: e.query, duration: e.duration });
        }
    });
}
async function connectDatabase() {
    await exports.prisma.$connect();
    logger.info('Database connected successfully');
}
async function disconnectDatabase() {
    await exports.prisma.$disconnect();
    logger.info('Database disconnected');
}
async function checkDatabaseHealth() {
    try {
        await exports.prisma.$queryRaw `SELECT 1`;
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=client.js.map