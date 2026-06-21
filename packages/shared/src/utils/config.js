"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnv = getEnv;
exports.resetEnvCache = resetEnvCache;
const zod_1 = require("zod");
const environmentSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    APP_PORT: zod_1.z.coerce.number().int().positive().default(3000),
    APP_HOST: zod_1.z.string().default('0.0.0.0'),
    APP_NAME: zod_1.z.string().default('StoryForge AI'),
    APP_VERSION: zod_1.z.string().default('1.0.0'),
    LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
    DATABASE_URL: zod_1.z.string().url(),
    DATABASE_POOL_MIN: zod_1.z.coerce.number().int().positive().default(2),
    DATABASE_POOL_MAX: zod_1.z.coerce.number().int().positive().default(10),
    REDIS_HOST: zod_1.z.string().default('localhost'),
    REDIS_PORT: zod_1.z.coerce.number().int().positive().default(6379),
    REDIS_PASSWORD: zod_1.z.string().optional(),
    REDIS_DB: zod_1.z.coerce.number().int().nonnegative().default(0),
    REDIS_URL: zod_1.z.string().optional(),
    OLLAMA_BASE_URL: zod_1.z.string().url().default('http://localhost:11434'),
    OLLAMA_STORY_MODEL: zod_1.z.string().default('qwen3:8b'),
    OLLAMA_SEO_MODEL: zod_1.z.string().default('llama3:8b'),
    OLLAMA_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(120_000),
    OLLAMA_MAX_RETRIES: zod_1.z.coerce.number().int().positive().default(3),
    COMFYUI_BASE_URL: zod_1.z.string().url().default('http://localhost:8188'),
    COMFYUI_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(300_000),
    COMFYUI_MAX_RETRIES: zod_1.z.coerce.number().int().positive().default(3),
    PIPER_BINARY_PATH: zod_1.z.string().default('piper'),
    PIPER_MODEL_PATH: zod_1.z.string().default('./models/piper/en_US-lessac-medium.onnx'),
    PIPER_VOICE: zod_1.z.string().default('en_US-lessac-medium'),
    PIPER_SAMPLE_RATE: zod_1.z.coerce.number().int().positive().default(22050),
    WHISPER_MODEL: zod_1.z.string().default('base.en'),
    WHISPER_LANGUAGE: zod_1.z.string().default('en'),
    WHISPER_DEVICE: zod_1.z.enum(['cpu', 'cuda']).default('cpu'),
    FFMPEG_BINARY_PATH: zod_1.z.string().default('ffmpeg'),
    FFPROBE_BINARY_PATH: zod_1.z.string().default('ffprobe'),
    VIDEO_WIDTH: zod_1.z.coerce.number().int().positive().default(1080),
    VIDEO_HEIGHT: zod_1.z.coerce.number().int().positive().default(1920),
    VIDEO_FPS: zod_1.z.coerce.number().int().positive().default(30),
    VIDEO_CODEC: zod_1.z.string().default('libx264'),
    VIDEO_CRF: zod_1.z.coerce.number().int().nonnegative().default(23),
    AUDIO_CODEC: zod_1.z.string().default('aac'),
    AUDIO_BITRATE: zod_1.z.string().default('128k'),
    STORAGE_TYPE: zod_1.z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_PATH: zod_1.z.string().default('./generated'),
    S3_ENDPOINT: zod_1.z.string().optional(),
    S3_ACCESS_KEY_ID: zod_1.z.string().optional(),
    S3_SECRET_ACCESS_KEY: zod_1.z.string().optional(),
    S3_BUCKET: zod_1.z.string().optional(),
    S3_REGION: zod_1.z.string().optional(),
    S3_PUBLIC_URL: zod_1.z.string().optional(),
    QUEUE_CONCURRENCY: zod_1.z.coerce.number().int().positive().default(2),
    QUEUE_MAX_RETRIES: zod_1.z.coerce.number().int().positive().default(3),
    QUEUE_RETRY_DELAY_MS: zod_1.z.coerce.number().int().positive().default(5_000),
    QUEUE_JOB_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(600_000),
    SCHEDULE_INTERVAL_HOURS: zod_1.z.coerce.number().int().positive().default(3),
    SCHEDULE_ENABLED: zod_1.z.coerce.boolean().default(true),
    SCHEDULE_TIMEZONE: zod_1.z.string().default('UTC'),
    STORY_MAX_SCENES: zod_1.z.coerce.number().int().positive().default(6),
    STORY_EPISODE_DURATION_SECONDS: zod_1.z.coerce.number().int().positive().default(40),
    STORY_TARGET_AUDIENCE: zod_1.z.string().default('13-35'),
    STORY_IMAGE_STYLE: zod_1.z.string().default('anime'),
    JWT_SECRET: zod_1.z.string().min(32).default('change_this_to_a_random_256_bit_secret_key_here!!'),
    JWT_EXPIRES_IN: zod_1.z.string().default('7d'),
    JWT_REFRESH_EXPIRES_IN: zod_1.z.string().default('30d'),
    CORS_ORIGINS: zod_1.z.string().default('http://localhost:5173'),
});
let _env = null;
function getEnv() {
    if (_env)
        return _env;
    const result = environmentSchema.safeParse(process.env);
    if (!result.success) {
        const missing = result.error.issues
            .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        throw new Error(`Invalid environment configuration:\n${missing}`);
    }
    _env = result.data;
    return _env;
}
function resetEnvCache() {
    _env = null;
}
//# sourceMappingURL=config.js.map