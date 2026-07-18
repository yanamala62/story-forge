// Converts a browser-extension JSON cookie export into the Netscape cookies.txt
// format that yt-dlp's --cookies flag requires. Reads ./youtube-cookies.json,
// writes ./youtube-cookies.txt. Both are gitignored.
import { readFileSync, writeFileSync } from 'fs';

const inputPath = process.argv[2] || './youtube-cookies.json';
const outputPath = process.argv[3] || './youtube-cookies.txt';

const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
const cookies = Array.isArray(raw) ? raw : raw.cookies;
if (!Array.isArray(cookies)) {
  console.error('Expected a JSON array of cookie objects (or { cookies: [...] }).');
  process.exit(1);
}

// Netscape format spec:
// domain \t includeSubdomains \t path \t secure \t expiry \t name \t value
const lines = ['# Netscape HTTP Cookie File', '# Generated for yt-dlp by Clip Forge', ''];

let count = 0;
for (const c of cookies) {
  const domain = c.domain;
  if (!domain || c.name == null) continue;

  const includeSub = domain.startsWith('.') ? 'TRUE' : 'FALSE';
  const path = c.path || '/';
  const secure = c.secure ? 'TRUE' : 'FALSE';
  // Session cookies (no expiry) → 0. yt-dlp accepts that.
  const expiry = c.session || c.expirationDate == null ? '0' : String(Math.floor(c.expirationDate));
  const name = c.name;
  const value = c.value ?? '';

  lines.push([domain, includeSub, path, secure, expiry, name, value].join('\t'));
  count++;
}

// yt-dlp requires a trailing newline.
writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${count} cookies to ${outputPath} in Netscape format.`);

// Quick sanity: warn if the critical YouTube auth cookies are missing.
const names = new Set(cookies.map((c) => c.name));
const critical = ['SID', 'HSID', 'SSID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID', 'LOGIN_INFO'];
const missing = critical.filter((n) => !names.has(n));
if (missing.length) {
  console.warn('WARNING: missing some auth cookies that YouTube usually needs:', missing.join(', '));
  console.warn('If ingestion still hits the bot-check, re-export while fully logged in to youtube.com.');
} else {
  console.log('All critical YouTube auth cookies present (SID / SAPISID / __Secure-*PSID / LOGIN_INFO).');
}
