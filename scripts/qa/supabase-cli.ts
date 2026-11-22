/**
 * The one way scripts here run the Supabase CLI (MYK9-1664).
 *
 * Two traps on the Mac that bare `execFileSync('supabase', ...)` falls into:
 *
 * 1. `supabase` on PATH is Homebrew's 2.x, which rejects the 3.x `--remote=`
 *    flags. The repo pins 3.x in `apps/myk9show/package.json`; this resolves
 *    that binary and falls back to PATH only where it is not installed (CI
 *    installs its own).
 * 2. 3.x blocks forever on any Management API call (`functions list`,
 *    `download`, `deploy`) when `SUPABASE_ACCESS_TOKEN` is unset, reading the
 *    stored login. Exporting the token from `~/.supabase/access-token` (where
 *    `supabase login` writes it) avoids the read. The timeout turns any other
 *    hang into a failure instead of a stalled run.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PINNED_CLI = join('apps', 'myk9show', 'node_modules', '.bin', 'supabase');

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The pinned CLI under `root` when installed, else `supabase` from PATH. */
export function supabaseBin(
  root: string = REPO_ROOT,
  exists: (p: string) => boolean = existsSync
): string {
  const pinned = join(root, PINNED_CLI);
  return exists(pinned) ? pinned : 'supabase';
}

/** `env` plus `SUPABASE_ACCESS_TOKEN` from the CLI's login file when it is unset. */
export function supabaseEnv(
  env: NodeJS.ProcessEnv = process.env,
  tokenFile: string = join(homedir(), '.supabase', 'access-token')
): NodeJS.ProcessEnv {
  if (env.SUPABASE_ACCESS_TOKEN || !existsSync(tokenFile)) return env;
  const token = readFileSync(tokenFile, 'utf8').trim();
  return token ? { ...env, SUPABASE_ACCESS_TOKEN: token } : env;
}

/** A Management API call that takes longer than this has hung, not worked. */
const SUPABASE_CLI_TIMEOUT_MS = 180_000;

/** Runs the CLI with the pinned binary, the login token and the timeout; returns stdout. */
export function runSupabase(
  args: readonly string[],
  opts: { cwd?: string; root?: string } = {}
): string {
  return execFileSync(supabaseBin(opts.root), args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    env: supabaseEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: SUPABASE_CLI_TIMEOUT_MS,
  });
}
