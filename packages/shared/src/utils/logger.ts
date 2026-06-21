import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, service, ...meta }) => {
  const metaStr = Object.keys(meta).length > 0 ? `\n${JSON.stringify(meta, null, 2)}` : '';
  return `${ts} [${service ?? 'app'}] ${level}: ${message}${metaStr}`;
});

function createFileTransports(service: string): winston.transport[] {
  const logDir = process.env['LOG_DIR'] ?? path.join(process.cwd(), 'logs');

  return [
    new DailyRotateFile({
      filename: path.join(logDir, `${service}-%DATE%-error.log`),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
    new DailyRotateFile({
      filename: path.join(logDir, `${service}-%DATE%-combined.log`),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ];
}

export function createLogger(service: string): winston.Logger {
  const isDev = process.env['NODE_ENV'] !== 'production';
  const level = process.env['LOG_LEVEL'] ?? (isDev ? 'debug' : 'info');

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: isDev
        ? combine(colorize({ all: true }), timestamp({ format: 'HH:mm:ss' }), devFormat)
        : combine(timestamp(), errors({ stack: true }), json()),
    }),
  ];

  if (!isDev) {
    transports.push(...createFileTransports(service));
  }

  return winston.createLogger({
    level,
    defaultMeta: { service },
    format: combine(errors({ stack: true }), timestamp()),
    transports,
    exitOnError: false,
  });
}

export const logger = createLogger('storyforge');
