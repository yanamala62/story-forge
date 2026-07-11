import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  APP_HOST: z.string().default('0.0.0.0'),
  APP_NAME: z.string().default('StoryForge AI'),
  APP_VERSION: z.string().default('1.0.0'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  // Off by default — Render (and most PaaS) only capture stdout/stderr, so
  // writing rotating log files nobody reads is pure overhead. Opt in for
  // deployments that actually consume the file output.
  LOG_TO_FILE: z.coerce.boolean().default(false),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().int().positive().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // OpenRouter — the only LLM provider this app uses.
  OPENROUTER_API_KEY: z.string(),
  OPENROUTER_STORY_MODEL: z.string().default('qwen/qwen3-8b:free'),
  OPENROUTER_SEO_MODEL: z.string().default('qwen/qwen3-8b:free'),
  // Comma-separated fallback models tried in order if the primary model is
  // rate-limited or unavailable. Ranked by free-tier availability.
  OPENROUTER_FALLBACK_MODELS: z
    .string()
    .default(
      'google/gemma-3-27b-it:free,deepseek/deepseek-chat-v3-0324:free,openai/gpt-oss-20b:free',
    ),
  OPENROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  OPENROUTER_MAX_RETRIES: z.coerce.number().int().positive().default(3),

  // Use the multilingual 'tiny' model (not 'tiny.en') as the default so that
  // non-English stories (Hindi, Telugu, etc.) can be transcribed. The .en suffix
  // models are English-only and cannot process any other language — they will time
  // out or produce empty output when given non-English audio.
  // Memory footprint is similar; multilingual 'tiny' is ~75MB vs 'tiny.en' ~75MB.
  WHISPER_MODEL: z.string().default('tiny'),
  WHISPER_LANGUAGE: z.string().default('en'),
  WHISPER_DEVICE: z.enum(['cpu', 'cuda']).default('cpu'),

  FFMPEG_BINARY_PATH: z.string().default('ffmpeg'),
  FFPROBE_BINARY_PATH: z.string().default('ffprobe'),
  // 720x1280 (not full-HD 1080x1920) — still valid for YouTube Shorts, but
  // meaningfully cuts ffmpeg's frame-buffer memory (~55% fewer pixels),
  // which matters on a 512MB host where ffmpeg OOM'd at the higher resolution.
  VIDEO_WIDTH: z.coerce.number().int().positive().default(720),
  VIDEO_HEIGHT: z.coerce.number().int().positive().default(1280),
  VIDEO_FPS: z.coerce.number().int().positive().default(30),
  VIDEO_CODEC: z.string().default('libx264'),
  VIDEO_CRF: z.coerce.number().int().nonnegative().default(23),
  AUDIO_CODEC: z.string().default('aac'),
  AUDIO_BITRATE: z.string().default('128k'),

  STORAGE_TYPE: z.enum(['local', 'supabase']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./generated'),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().optional(),

  // YouTube Data API v3 (M7 upload)
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN: z.string().optional(),
  YOUTUBE_CHANNEL_ID: z.string().optional(),

  STORY_MAX_SCENES: z.coerce.number().int().positive().default(6),
  STORY_EPISODE_DURATION_SECONDS: z.coerce.number().int().positive().default(40),
  STORY_TARGET_AUDIENCE: z.string().default('13-35'),
  STORY_IMAGE_STYLE: z.string().default('anime'),

  JWT_SECRET: z.string().min(32).default('change_this_to_a_random_256_bit_secret_key_here!!'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
});

export type Environment = z.infer<typeof environmentSchema>;

let _env: Environment | null = null;

export function getEnv(): Environment {
  if (_env) return _env;

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

export function resetEnvCache(): void {
  _env = null;
}
