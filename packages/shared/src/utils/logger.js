"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.createLogger = createLogger;
const winston_1 = __importDefault(require("winston"));
const winston_daily_rotate_file_1 = __importDefault(require("winston-daily-rotate-file"));
const path_1 = __importDefault(require("path"));
const { combine, timestamp, errors, json, colorize, printf } = winston_1.default.format;
const devFormat = printf(({ level, message, timestamp: ts, service, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${ts} [${service ?? 'app'}] ${level}: ${message}${metaStr}`;
});
function createFileTransports(service) {
    const logDir = process.env['LOG_DIR'] ?? path_1.default.join(process.cwd(), 'logs');
    return [
        new winston_daily_rotate_file_1.default({
            filename: path_1.default.join(logDir, `${service}-%DATE%-error.log`),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxSize: '20m',
            maxFiles: '14d',
            zippedArchive: true,
        }),
        new winston_daily_rotate_file_1.default({
            filename: path_1.default.join(logDir, `${service}-%DATE%-combined.log`),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
            zippedArchive: true,
        }),
    ];
}
function createLogger(service) {
    const isDev = process.env['NODE_ENV'] !== 'production';
    const level = process.env['LOG_LEVEL'] ?? (isDev ? 'debug' : 'info');
    const transports = [
        new winston_1.default.transports.Console({
            format: isDev
                ? combine(colorize({ all: true }), timestamp({ format: 'HH:mm:ss' }), devFormat)
                : combine(timestamp(), errors({ stack: true }), json()),
        }),
    ];
    if (!isDev) {
        transports.push(...createFileTransports(service));
    }
    return winston_1.default.createLogger({
        level,
        defaultMeta: { service },
        format: combine(errors({ stack: true }), timestamp()),
        transports,
        exitOnError: false,
    });
}
exports.logger = createLogger('storyforge');
//# sourceMappingURL=logger.js.map