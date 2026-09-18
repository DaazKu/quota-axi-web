import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAcquirer } from '../src/acquisition.js';

export async function fixtureAcquirer(t, code, options = {}) {
  const root = resolve('.test-tmp');
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(`${root}/case-`);
  t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = `${dir}/quota-mock.mjs`;
  await writeFile(executable, `#!${process.execPath}\n${code}\n`, { mode: 0o700 });
  const acquirer = createAcquirer({ executable, ...options });
  t.after(() => acquirer.close());
  return acquirer;
}
