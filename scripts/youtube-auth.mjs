/**
 * ONE-TIME YouTube OAuth setup — run this ONCE to get your refresh token.
 *
 * Usage:
 *   node scripts/youtube-auth.mjs
 *
 * Prerequisites:
 *   1. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env
 *   2. Run this script — it prints an auth URL
 *   3. Open the URL in your browser, sign in with your YouTube channel account
 *   4. Copy the `code` from the redirect URL (or paste from browser)
 *   5. The script prints your YOUTUBE_REFRESH_TOKEN — paste it in .env
 *
 * You only need to do this ONCE. The refresh token never expires.
 */

import { google } from 'googleapis';
import { createInterface } from 'readline';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (simple parse — no dotenv needed)
function loadEnv() {
  const envPath = join(__dirname, '..', '.env');
  if (!existsSync(envPath)) {
    console.error('ERROR: .env file not found at', envPath);
    process.exit(1);
  }
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = val;
  }
  return env;
}

const env = loadEnv();

const CLIENT_ID = env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = env.YOUTUBE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    '\nERROR: YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set in .env\n' +
    'Get them from: https://console.cloud.google.com → APIs & Services → Credentials\n',
  );
  process.exit(1);
}

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
];

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob', // Desktop/CLI flow — no redirect server needed
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // Forces refresh token to be returned
});

console.log('\n=== StoryForge AI — YouTube One-Time Auth ===\n');
console.log('Step 1: Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nStep 2: Sign in with the Google account that owns your YouTube channel.');
console.log('Step 3: After granting access, copy the authorization code shown.\n');

const rl = createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste the authorization code here: ', async (code) => {
  rl.close();

  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    oauth2Client.setCredentials(tokens);

    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      console.error(
        '\nERROR: No refresh token received. Try revoking access at ' +
        'https://myaccount.google.com/permissions and running this script again.\n',
      );
      process.exit(1);
    }

    console.log('\n✅ SUCCESS! Add this to your .env file:\n');
    console.log(`YOUTUBE_REFRESH_TOKEN=${refreshToken}`);
    console.log('\nYou only need to run this once — the refresh token never expires.\n');
  } catch (error) {
    console.error('\nERROR getting token:', error.message);
    process.exit(1);
  }
});
