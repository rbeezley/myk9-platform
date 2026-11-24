/**
 * The one way scripts here run the Supabase CLI (MYK9-1664).
 *
 * Two traps on the Mac that bare `execFileSync('supabase', ...)` falls into:
 *
 * 1. `supabase` on PATH is Homebrew's 2.x, which rejects the 3.x `--remote=`
 *    flags. The repo pins 3.x in `apps/myk9show/package.json`; this resolves
 *    that binary and falls back to PATH only where it is not installed (CI
 *    installs its own). Either way the binary must report 3.x, so a stale
 *    worktree that still holds 2.x fails fast with the install instruction
 *    instead of running a flag it rejects. Windows cannot execute pnpm's
 *    extensionless `.bin` shim, so there the package's JS entry runs under
 *    `process.execPath`.
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

/** The CLI major version this repo is written for. */
export const REQUIRED_MAJOR = '3';

/** What an operator runs when the installed CLI is not the pinned major. */
export const INSTALL_INSTRUCTION = 'pnpm install --frozen-lockfile';

/** The pinned package directory, where its `bin` field names the JS entry. */
const PINNED_PACKAGE = join('apps', 'myk9show', 'node_modules', 'supabase');

export interface SupabaseCommand {
  command: string;
  /** Arguments that go before the caller's (the JS entry, on Windows). */
  prefixArgs: string[];
}

function pinnedJsEntry(root: string): string {
  const pkgDir = join(root, PINNED_PACKAGE);
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
    bin?: string | Record<string, string>;
  };
  const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.supabase;
  if (!rel) throw new Error(`${pkgDir}/package.json has no "bin.supabase" entry`);
  return join(pkgDir, rel);
}

/**
 * How to launch the CLI under `root`: the pinned binary when installed (its JS
 * entry under `process.execPath` on Windows), else `supabase` from PATH. The
 * version is checked separately by `assertSupportedVersion`.
 */
export function supabaseCommand(
  root: string = REPO_ROOT,
  exists: (p: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform
): SupabaseCommand {
  const pinned = join(root, PINNED_CLI);
  if (!exists(pinned)) return { command: 'supabase', prefixArgs: [] };
  if (platform === 'win32') {
    return { command: process.execPath, prefixArgs: [pinnedJsEntry(root)] };
  }
  return { command: pinned, prefixArgs: [] };
}

/** The pinned CLI under `root` when installed, else `supabase` from PATH. */
export function supabaseBin(root: string = REPO_ROOT, exists?: (p: string) => boolean): string {
  return supabaseCommand(root, exists, 'linux').command;
}

/** Throws with the install instruction unless `versionOutput` is a 3.x version. */
export function assertSupportedVersion(versionOutput: string, where: string): void {
  const version = versionOutput.trim();
  if (version.startsWith(`${REQUIRED_MAJOR}.`)) return;
  throw new Error(
    `Supabase CLI ${version || '(no version reported)'} at ${where}; this repo needs ` +
      `${REQUIRED_MAJOR}.x (the --remote flag). Run \`${INSTALL_INSTRUCTION}\` ` +
      `to install the pinned CLI.`
  );
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
  const { command, prefixArgs } = supabaseCommand(opts.root);
  const run = (extra: readonly string[]) =>
    execFileSync(command, [...prefixArgs, ...extra], {
      cwd: opts.cwd,
      encoding: 'utf8',
      env: supabaseEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: SUPABASE_CLI_TIMEOUT_MS,
    });
  assertSupportedVersion(run(['--version']), command);
  return run(args);
}
