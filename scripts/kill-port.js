/**
 * Cross-platform: kill any process listening on port 8787 before starting.
 * Works on Windows (netstat + taskkill) and Unix (lsof / fuser).
 */
import { execSync } from 'node:child_process';

const PORT = 8787;

try {
  if (process.platform === 'win32') {
    // Find PID using netstat, then taskkill
    const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
    const pids = new Set(
      out.split('\n')
        .map(line => line.trim().split(/\s+/).pop())
        .filter(pid => pid && /^\d+$/.test(pid) && pid !== '0')
    );
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`[kill-port] Killed PID ${pid} on port ${PORT}`);
      } catch { /* already gone */ }
    }
  } else {
    // Unix: fuser or lsof
    try {
      execSync(`fuser -k ${PORT}/tcp`, { stdio: 'ignore' });
    } catch {
      try {
        const pid = execSync(`lsof -ti tcp:${PORT}`, { encoding: 'utf8' }).trim();
        if (pid) execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      } catch { /* nothing to kill */ }
    }
    console.log(`[kill-port] Cleared port ${PORT}`);
  }
} catch {
  // Port is free, nothing to do
}
