import { spawn } from 'node:child_process';
import { parseReport } from './report.js';

export const REFRESH_MS = 5 * 60 * 1000;
export const CLI_ARGS = Object.freeze(['--json', '--no-credential-refresh']);

/** Executable injection is for in-process tests only, never HTTP or CLI configuration. */
export function createAcquirer({ executable = 'quota-axi', timeoutMs = 45_000, maxBytes = 1024 * 1024 } = {}) {
  let cancel;
  return {
    close() { cancel?.(); },
    read() {
      return new Promise((resolve, reject) => {
        let child;
        let timer;
        let finished = false;
        let bytes = 0;
        const chunks = [];
        const kill = () => {
          if (!child?.pid) return;
          // Kill the entire CLI process group, including vendor helpers, on POSIX.
          try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        };
        const finish = (error, report) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          cancel = undefined;
          kill();
          if (error) reject(error); else resolve(report);
        };
        cancel = () => finish(new Error('Quota acquisition stopped.'));
        try {
          child = spawn(executable, CLI_ARGS, { shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
        } catch {
          finish(new Error('Could not start quota-axi. Check that it is installed and on PATH.'));
          return;
        }
        timer = setTimeout(() => finish(new Error('quota-axi timed out. No new quota data was accepted.')), timeoutMs);
        child.on('error', () => finish(new Error('Could not start quota-axi. Check that it is installed and on PATH.')));
        const collect = (chunk, keep) => {
          if (finished) return;
          bytes += chunk.length;
          if (bytes > maxBytes) finish(new Error('quota-axi exceeded the output limit.'));
          else if (keep) chunks.push(chunk);
        };
        child.stdout.on('data', (chunk) => collect(chunk, true));
        child.stderr.on('data', (chunk) => collect(chunk, false));
        child.on('close', (code) => {
          if (finished) return;
          if (code !== 0 && code !== 1) {
            finish(new Error('quota-axi exited unexpectedly. Check the CLI locally.'));
            return;
          }
          try { finish(null, parseReport(Buffer.concat(chunks).toString('utf8'))); }
          catch (error) { finish(error); }
        });
      });
    },
  };
}

/** All tabs share a single acquisition and a server-owned cooldown. */
export function createQuotaStore(acquirer, { now = Date.now } = {}) {
  let report = null;
  let updatedAt = null;
  let attemptedAt = null;
  let error = null;
  let nextRefresh = 0;
  let failures = 0;
  let limitedRuns = 0;
  let pending;
  const snapshot = () => ({
    report, updatedAt, attemptedAt, error,
    nextRefreshAt: new Date(nextRefresh).toISOString(),
    stale: Boolean(report && (error || now() - Date.parse(updatedAt) >= REFRESH_MS
      || now() - Date.parse(report.generatedAt) >= REFRESH_MS)),
  });
  return {
    async read() {
      if (pending) return pending;
      if (now() < nextRefresh) return snapshot();
      pending = (async () => {
        attemptedAt = new Date(now()).toISOString();
        try {
          const result = await acquirer.read();
          report = result;
          updatedAt = new Date(now()).toISOString();
          error = null;
          failures = 0;
          const limited = result.providers.some((p) => p.state.status === 'rate_limited');
          limitedRuns = limited ? limitedRuns + 1 : 0;
          const delay = limited ? Math.min(60 * 60 * 1000, 15 * 60 * 1000 * 2 ** Math.min(limitedRuns - 1, 2)) : REFRESH_MS;
          nextRefresh = Math.max(now() + delay, ...result.providers.map((p) => Date.parse(p.state.retryAfter) || 0));
        } catch (cause) {
          error = cause.message;
          failures += 1;
          nextRefresh = now() + Math.min(60 * 60 * 1000, REFRESH_MS * 2 ** Math.min(failures - 1, 4));
        }
        return snapshot();
      })();
      try { return await pending; } finally { pending = undefined; }
    },
  };
}
