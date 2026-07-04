#!/usr/bin/env node
// Pushes the Prisma schema to the database and seeds the system user.
// Reads DATABASE_URL from the root .env so it works without any shell env tricks.
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ── Load root .env ────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
const env = { ...process.env };

if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in env)) env[key] = val; // don't override real env vars
  });
}

const DATABASE_URL = env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[db-setup] DATABASE_URL not found in .env or environment');
  process.exit(1);
}

const dbDir = path.join(__dirname, '..', 'packages', 'database');

// ── Push schema ───────────────────────────────────────────────────────────────
console.log('[db-setup] Pushing Prisma schema to database…');
try {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: dbDir,
    env: { ...env, DATABASE_URL },
    stdio: 'inherit',
  });
  console.log('[db-setup] Schema synced.');
} catch {
  console.error('[db-setup] Schema push failed.');
  process.exit(1);
}

// ── Seed system user (ON CONFLICT DO NOTHING — safe to re-run) ────────────────
console.log('[db-setup] Seeding system user…');
const seedSql = path.join(dbDir, 'prisma', 'migrations', 'seed.sql');
if (fs.existsSync(seedSql)) {
  try {
    execSync(
      `docker exec storyforgeai-postgres-1 psql -U storyforge -d storyforge_db -c "${
        fs.readFileSync(seedSql, 'utf-8')
          .replace(/\n/g, ' ')
          .replace(/"/g, '\\"')
      }"`,
      { stdio: 'inherit' },
    );
    console.log('[db-setup] Seed complete.');
  } catch {
    console.warn('[db-setup] Seed skipped (docker exec failed — container may not be named storyforgeai-postgres-1).');
  }
} else {
  console.log('[db-setup] No seed.sql found, skipping.');
}
