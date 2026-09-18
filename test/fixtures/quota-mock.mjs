#!/usr/bin/env node
import assert from 'node:assert/strict';
import { sampleReport } from './report.js';
assert.deepEqual(process.argv.slice(2), ['--json', '--no-credential-refresh']);
console.log(JSON.stringify(sampleReport()));
process.exitCode = 1; // Valid reports on exit 1 must still render.
