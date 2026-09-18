import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { parseReport } from '../src/report.js';
import { sampleReport } from './fixtures/report.js';

async function ui(t) {
  const dom = new JSDOM(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'), { url: 'http://127.0.0.1:4317', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const timers = [];
  dom.window.setInterval = (callback) => { timers.push(callback); };
  const data = { report: parseReport(JSON.stringify(sampleReport())), updatedAt: new Date().toISOString(), nextRefreshAt: new Date(Date.now() + 300_000).toISOString(), stale: false, error: null };
  const requests = [];
  dom.window.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => data }; };
  const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  dom.window.eval(script.replaceAll('export ', '') + '\nwindow.testApi = {render, refresh};');
  await new Promise((resolve) => setImmediate(resolve));
  return { window: dom.window, document: dom.window.document, api: dom.window.testApi, data, timers, requests };
}

test('browser flow renders windows, zero capacity, unknown, stale and provider errors', async (t) => {
  const { document, requests } = await ui(t);
  assert.equal(document.querySelectorAll('.card').length, 6);
  assert.match(document.body.textContent, /72%/);
  assert.match(document.body.textContent, /0%/);
  assert.match(document.body.textContent, /68%remaining/);
  assert.match(document.body.textContent, /Quota unknown/);
  assert.match(document.body.textContent, /Stale/);
  assert.match(document.body.textContent, /Authentication needed/);
  assert.match(document.body.textContent, /Provider error/);
  assert.doesNotMatch(document.body.textContent, /Synthetic private diagnostic/);
  assert.equal(requests[0].url, '/api/quota');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers['X-Quota-Viewer'], '1');
  assert.equal(document.querySelector('#providers').getAttribute('aria-busy'), 'false');
  assert.equal(document.querySelectorAll('meter[aria-label]').length, 5);
});

test('manual refresh, local auto-check, and disconnect recovery', async (t) => {
  const { window, document, requests, timers, api } = await ui(t);
  document.querySelector('#refresh').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 2);
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  timers[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 3);
  Object.defineProperty(document, 'hidden', { value: true });
  timers[0]();
  assert.equal(requests.length, 3);
  window.fetch = async () => { throw new Error('offline'); };
  await api.refresh();
  assert.match(document.querySelector('#notice').textContent, /Cannot reach the local server/);
  assert.match(document.querySelector('.status').textContent, /Stale/);
  assert.equal(document.querySelector('#refresh').disabled, false);
  assert.equal(document.querySelectorAll('.card').length, 6);
});

test('acquisition failure, empty report, rate limit, untrusted and safe text rendering', async (t) => {
  const { document, api, data } = await ui(t);
  api.render({ ...data, report: null, updatedAt: null, error: 'Unsupported quota schema.' });
  assert.match(document.body.textContent, /Acquisition failed: Unsupported quota schema/);
  assert.match(document.body.textContent, /No quota report available/);
  api.render({ ...data, report: { providers: [] } });
  assert.match(document.querySelector('#notice').textContent, /No providers were reported/);
  const p = data.report.providers[0];
  p.windows[0].label = '<img src=x onerror=alert(1)>';
  p.windows[0].untrusted = true;
  delete p.windows[0].percentRemaining;
  p.windows[0].percentUsed = 28;
  p.state.status = 'rate_limited';
  p.state.retryAfter = '2030-01-01T14:00:00Z';
  api.render(data);
  assert.equal(document.querySelector('img'), null);
  assert.match(document.body.textContent, /<img src=x/);
  assert.match(document.body.textContent, /Rate limited/);
  assert.match(document.body.textContent, /28%used/);
  assert.match(document.body.textContent, /Untrusted window/);
  assert.match(document.body.textContent, /Retry after/);
});
