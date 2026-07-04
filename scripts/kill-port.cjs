#!/usr/bin/env node
// Cross-platform: kills the process listening on a given port before server starts.
// Usage: node scripts/kill-port.cjs 3000
const { execSync } = require('child_process');

const port = process.argv[2] ?? '3000';

try {
  if (process.platform === 'win32') {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const pids = new Set(
      out.split('\n')
        .filter((l) => l.includes('LISTENING'))
        .map((l) => l.trim().split(/\s+/).pop())
        .filter(Boolean)
    );
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`[kill-port] Killed PID ${pid} holding port ${port}`);
      } catch (_) { /* already dead */ }
    }
  } else {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { shell: true });
    console.log(`[kill-port] Cleared port ${port}`);
  }
} catch (_) {
  // Port not in use — nothing to kill
}
