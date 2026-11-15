// Argument and environment builders for the two external commands single-show-restore.ts runs.
// Pure, so the exact argv and libpq environment are unit-tested without spawning anything.
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

/** The target URL travels only in libpq env vars; the SQL arrives on stdin, never in argv. */
export function buildPsqlInvocation(
  connection: TargetConnection,
  baseEnv: NodeJS.ProcessEnv,
  caFile: string
): PsqlInvocation {
  return {
    args: ['-X', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    env: { ...baseEnv, ...connection.env, PGSSLROOTCERT: caFile },
  };
}
