// Argument and environment builders for the two external commands single-show-restore.ts runs.
// Pure, so the exact argv and libpq environment are unit-tested without spawning anything.
import { chmodSync, writeFileSync } from 'node:fs';
import type { TargetConnection } from './single-show-restore-guards';

export function buildPgRestoreArgs(extra: string[], outFile: string, dumpPath: string): string[] {
  return [...extra, '--no-owner', '--no-privileges', '-f', outFile, dumpPath];
}

export const SCHEMA_ONLY_ARGS = ['--schema-only'];
export const DATA_ONLY_ARGS = ['--data-only', '--schema', 'public'];

export interface PsqlInvocation {
  args: string[];
  env: NodeJS.ProcessEnv;
}

/** Drops every inherited PG* variable (PGSERVICE, PGHOSTADDR, PGOPTIONS...) so only the target applies. */
export function withoutPgVars(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !/^PG/i.test(key)));
}

/** The target URL travels only in libpq env vars; the SQL arrives on stdin, never in argv. */
export function buildPsqlInvocation(
  connection: TargetConnection,
  baseEnv: NodeJS.ProcessEnv,
  caFile: string
): PsqlInvocation {
  return {
    args: ['-X', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    env: { ...withoutPgVars(baseEnv), ...connection.env, PGSSLROOTCERT: caFile },
  };
}

/** The plan contains row data: owner read/write only, even when the file already existed. */
export function writePlanFile(path: string, sql: string): void {
  writeFileSync(path, sql, { mode: 0o600 });
  chmodSync(path, 0o600); // writeFile's mode only applies when it creates the file
}
