import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startServer } from '../src/server.js';
import { parseReport } from '../src/report.js';
import { sampleReport } from './fixtures/report.js';
import { fixtureAcquirer } from './helpers.js';

test('loopback server serves local assets, shares real mock process acquisition, and never exposes identity', async (t) => {
  const acquirer = await fixtureAcquirer(t, `console.log(${JSON.stringify(JSON.stringify(sampleReport()))}); process.exitCode = 1;`);
  const app = await startServer({ port: 0, acquirer });
  t.after(() => app.close());
  assert.equal(app.server.address().address, '127.0.0.1');
  for (const path of ['/', '/app.js', '/style.css']) {
    const response = await fetch(app.url + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  const request = () => fetch(app.url + '/api/quota', { method: 'POST', headers: { Origin: app.url, 'X-Quota-Viewer': '1', 'Sec-Fetch-Site': 'same-origin' } });
  const data = await Promise.all([request(), request()].map(async (p) => (await p).json()));
  assert.deepEqual(data[0], data[1]);
  assert.equal(data[0].report.providers.length, 6);
  assert.equal(data[0].error, null);
  assert.equal((await fetch(app.url + '/../../package.json')).status, 404);
});

test('host, origin, fetch metadata, method, and body protections reject before acquisition', async (t) => {
  let calls = 0;
  const app = await startServer({ port: 0, acquirer: { read: async () => { calls++; return parseReport(JSON.stringify(sampleReport())); }, close() {} } });
  t.after(() => app.close());
  const safe = { Origin: app.url, 'X-Quota-Viewer': '1' };
  const cases = [
    { method: 'GET', headers: safe, expected: 405 },
    { method: 'OPTIONS', headers: safe, expected: 405 },
    { method: 'POST', headers: { ...safe, Origin: 'https://evil.example' }, expected: 403 },
    { method: 'POST', headers: { ...safe, Origin: 'null' }, expected: 403 },
    { method: 'POST', headers: { 'X-Quota-Viewer': '1' }, expected: 403 },
    { method: 'POST', headers: { Origin: app.url }, expected: 403 },
    { method: 'POST', headers: { ...safe, 'Sec-Fetch-Site': 'cross-site' }, expected: 403 },
    { method: 'POST', headers: { ...safe, 'Sec-Fetch-Site': 'same-site' }, expected: 403 },
    { method: 'POST', headers: { ...safe, 'Sec-Fetch-Site': 'none' }, expected: 403 },
    { method: 'POST', headers: safe, body: 'command=anything', expected: 403 },
  ];
  for (const { expected, ...options } of cases) {
    const response = await fetch(app.url + '/api/quota', options);
    assert.equal(response.status, expected, JSON.stringify(options));
  }
  for (const site of ['cross-site', 'same-site']) {
    assert.equal((await fetch(app.url, { headers: { 'Sec-Fetch-Site': site } })).status, 403);
  }
  // Node fetch may normalize Host; use a raw HTTP request for rebinding tests.
  for (const host of ['evil.example', 'localhost', '127.0.0.1:1']) {
    const status = await new Promise((resolve, reject) => {
      const req = request(app.url + '/api/quota', { method: 'POST', headers: { ...safe, Host: host } }, (res) => {
        res.resume(); resolve(res.statusCode);
      });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 403);
  }
  assert.equal(calls, 0);
  assert.equal((await fetch(app.url + '/api/quota', { method: 'POST', headers: safe })).status, 200);
  assert.equal(calls, 1);
});
