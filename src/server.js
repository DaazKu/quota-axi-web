import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createAcquirer, createQuotaStore } from './acquisition.js';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

export async function startServer({ port = 4317, acquirer = createAcquirer() } = {}) {
  const store = createQuotaStore(acquirer);
  const loaded = new Map(await Promise.all([...assets].map(async ([path, [file, type]]) =>
    [path, { type, body: await readFile(new URL(`../public/${file}`, import.meta.url)) }])));
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const send = (status, text) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); };
    const host = `127.0.0.1:${server.address().port}`;
    const origin = `http://${host}`;
    const site = req.headers['sec-fetch-site'];
    if (req.headers.host !== host || (req.headers.origin !== undefined && req.headers.origin !== origin)
      || (site !== undefined && site !== 'same-origin' && site !== 'none')) {
      send(403, 'Only direct local, same-origin requests are allowed.'); return;
    }
    if (req.url === '/api/quota') {
      // A simple form, image, navigation, or cross-origin fetch cannot acquire data.
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); send(405, 'Use POST.'); return; }
      if (req.headers.origin !== origin || req.headers['x-quota-viewer'] !== '1'
        || (site !== undefined && site !== 'same-origin')
        || req.headers['transfer-encoding'] !== undefined
        || (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0')) {
        send(403, 'A same-origin, empty viewer request is required.'); return;
      }
      const data = await store.read();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { send(405, 'Use GET.'); return; }
    const asset = loaded.get(req.url);
    if (!asset) { send(404, 'Not found.'); return; }
    res.writeHead(200, { 'Content-Type': asset.type });
    res.end(req.method === 'HEAD' ? undefined : asset.body);
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxRequestsPerSocket = 100;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    server,
    async close() {
      acquirer.close();
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
