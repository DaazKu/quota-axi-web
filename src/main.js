import { startServer } from './server.js';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]) || +args[1] < 1024 || +args[1] > 65535)) {
  console.error('Usage: npm start -- [--port 4317] (port 1024-65535). Host is always 127.0.0.1.');
  process.exitCode = 1;
} else {
  try {
    const app = await startServer({ port: args.length ? +args[1] : 4317 });
    console.log(`quota-axi-web: ${app.url}\nOpen this address directly. Press Ctrl+C to stop.`);
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      await app.close();
    });
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? 'Port in use. Choose another with --port.' : 'Could not start the local server.');
    process.exitCode = 1;
  }
}
