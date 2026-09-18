// Test-only entry point. Cannot reach the installed quota-axi executable.
import { fileURLToPath } from 'node:url';
import { createAcquirer } from '../src/acquisition.js';
import { startServer } from '../src/server.js';

const app = await startServer({ port: 4318, acquirer: createAcquirer({ executable: fileURLToPath(new URL('./fixtures/quota-mock.mjs', import.meta.url)) }) });
console.log(`Synthetic demo only: ${app.url}`);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (closing) return;
  closing = true;
  await app.close();
});
