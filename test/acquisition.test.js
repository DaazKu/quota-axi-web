import test from 'node:test';
import assert from 'node:assert/strict';
import { createAcquirer, createQuotaStore, REFRESH_MS } from '../src/acquisition.js';
import { parseReport } from '../src/report.js';
import { sampleReport } from './fixtures/report.js';
import { fixtureAcquirer } from './helpers.js';

const raw = JSON.stringify(sampleReport());
const output = `process.stdout.write(${JSON.stringify(raw)});`;

test('fixed safe arguments, redacted projection, exit 0 and exit 1 reports', async (t) => {
  for (const exit of [0, 1]) {
    const a = await fixtureAcquirer(t, `import assert from 'node:assert/strict'; assert.deepEqual(process.argv.slice(2), ['--json', '--no-credential-refresh']); ${output} process.exitCode = ${exit};`);
    const data = await a.read();
    assert.equal(data.providers[0].windows[0].percentRemaining, 72);
    assert.equal(data.providers[5].state.status, 'error');
    assert.equal(data.providers[5].state.error, undefined);
  }
});

test('bad JSON, unsupported schema, malformed reports and abnormal exits fail safely', async (t) => {
  for (const [code, message] of [
    ['console.log("not JSON")', /invalid JSON/],
    ['console.log(JSON.stringify({schemaVersion: 6}))', /Unsupported quota schema/],
    ['console.log(JSON.stringify({schemaVersion: 5, providers: []}))', /Invalid quota report/],
    [`${output} process.exitCode = 2`, /exited unexpectedly/],
    ['process.stderr.write("SECRET"); process.exitCode = 2', /exited unexpectedly/],
  ]) {
    const a = await fixtureAcquirer(t, code);
    await assert.rejects(a.read(), message);
  }
});

test('missing executable produces actionable, non-sensitive failure', async () => {
  await assert.rejects(createAcquirer({ executable: '/not-a-real-quota-test-executable' }).read(), /installed and on PATH/);
});

test('timeout, stdout and stderr bounds terminate the subprocess', async (t) => {
  const hanging = await fixtureAcquirer(t, 'setInterval(() => {}, 1000)', { timeoutMs: 100 });
  await assert.rejects(hanging.read(), /timed out/);
  for (const stream of ['stdout', 'stderr']) {
    const a = await fixtureAcquirer(t, `process.${stream}.write('x'.repeat(4096)); setInterval(() => {}, 1000)`, { maxBytes: 1024 });
    await assert.rejects(a.read(), /output limit/);
  }
});

test('shutdown cancels an in-flight subprocess', async (t) => {
  const a = await fixtureAcquirer(t, 'setInterval(() => {}, 1000)');
  const pending = a.read();
  a.close();
  await assert.rejects(pending, /stopped/);
});

test('allowlist drops identity, diagnostics, commands, and unexpected fields', () => {
  const report = sampleReport();
  Object.assign(report.providers[0], { account: { email: 'synthetic@example.invalid' }, plan: 'PRIVATE', attempts: [{ error: 'SECRET' }] });
  Object.assign(report.providers[0].state, { error: 'SECRET', remedyCommand: 'unsafe command', sourcesTried: ['PRIVATE'] });
  const sanitized = JSON.stringify(parseReport(JSON.stringify(report)));
  assert.doesNotMatch(sanitized, /PRIVATE|SECRET|synthetic@|unsafe command/);
});

test('reject malformed window values rather than fabricate quota', () => {
  for (const value of [-1, 101, '72', null]) {
    const report = sampleReport();
    report.providers[0].windows[0].percentRemaining = value;
    assert.throws(() => parseReport(JSON.stringify(report)), /Invalid quota report/);
  }
});

test('concurrent reads share acquisition; manual reads cannot bypass cooldown', async () => {
  let now = Date.parse('2030-01-01T12:00:00Z');
  let calls = 0;
  let release;
  const store = createQuotaStore({ read: () => { calls++; return new Promise((resolve) => { release = resolve; }); } }, { now: () => now });
  const reads = [store.read(), store.read(), store.read()];
  assert.equal(calls, 1);
  release(parseReport(JSON.stringify(sampleReport(new Date(now).toISOString()))));
  const results = await Promise.all(reads);
  assert.deepEqual(results[0], results[2]);
  now += REFRESH_MS - 1;
  await store.read();
  assert.equal(calls, 1);
  now++;
  const again = store.read();
  assert.equal(calls, 2);
  release(parseReport(raw));
  await again;
});

test('provider retry-after and fallback rate limit backoff gate the entire CLI', async () => {
  let now = Date.parse('2030-01-01T12:00:00Z');
  let calls = 0;
  const data = parseReport(raw);
  data.providers[0].state.status = 'rate_limited';
  data.providers[0].state.retryAfter = '2030-01-01T14:00:00Z';
  const store = createQuotaStore({ read: async () => { calls++; return data; } }, { now: () => now });
  assert.equal((await store.read()).nextRefreshAt, '2030-01-01T14:00:00.000Z');
  now += REFRESH_MS;
  await store.read();
  assert.equal(calls, 1);
  now = Date.parse('2030-01-01T14:00:00Z');
  delete data.providers[0].state.retryAfter;
  assert.equal((await store.read()).nextRefreshAt, '2030-01-01T14:30:00.000Z');
});

test('subprocess failures preserve last good report as stale and back off', async () => {
  let now = Date.now();
  let calls = 0;
  const store = createQuotaStore({ read: async () => {
    if (++calls > 1) throw new Error('quota-axi timed out.');
    return parseReport(raw);
  } }, { now: () => now });
  const first = await store.read();
  now += REFRESH_MS;
  const failed = await store.read();
  assert.equal(failed.stale, true);
  assert.deepEqual(failed.report, first.report);
  assert.equal(failed.updatedAt, first.updatedAt);
  assert.match(failed.error, /timed out/);
  await store.read();
  assert.equal(calls, 2);
  now += REFRESH_MS;
  const second = await store.read();
  assert.equal(Date.parse(second.nextRefreshAt) - now, 2 * REFRESH_MS);
});

test('first acquisition failure has no invented report', async () => {
  const store = createQuotaStore({ read: async () => { throw new Error('Unavailable'); } });
  const data = await store.read();
  assert.equal(data.report, null);
  assert.equal(data.updatedAt, null);
  assert.equal(data.error, 'Unavailable');
});
