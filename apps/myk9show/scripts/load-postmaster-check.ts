import { appendFileSync } from 'node:fs';
import {
  comparePostmasterStart,
  readPostmasterStart,
} from '../src/test/load/loadPostmasterRestart';

/**
 * Prepare job, before load: prints `postmaster-start=<iso>` to GITHUB_OUTPUT.
 * The AFTER read happens in the platform job and the comparison in aggregation,
 * so a restart is a gating failure before any evidence is written.
 */
const start = await readPostmasterStart(process.env);
if (!start || comparePostmasterStart(start, start).status !== 'unchanged') {
  console.error('Database did not return a readable postmaster start time.');
  process.exit(1);
}
if (!process.env.GITHUB_OUTPUT) {
  console.error('GITHUB_OUTPUT is not set.');
  process.exit(1);
}
appendFileSync(process.env.GITHUB_OUTPUT, `postmaster-start=${start}\n`);
console.log(`Postgres started ${start}.`);
