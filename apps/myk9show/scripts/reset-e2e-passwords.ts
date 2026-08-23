/**
 * Reset the e2e test-account passwords in Supabase Auth — no email involved.
 *
 * The the myk9t.com accounts use fake addresses, so the dashboard's
 * "send recovery email" flow can never reach them. This script instead uses
 * the Admin API (`auth.admin.updateUserById`) with the service-role key to set
 * each account's password to the canonical value from E2E_* env vars, which
 * are the same values stored in the GitHub Actions secrets. Result: Supabase
 * Auth, CI secrets, and .env.local all agree again.
 *
 * Idempotent: accounts whose password already works are skipped (verified via
 * a real anon-key sign-in), so re-running is always safe and cheap.
 *
 * `.env.local` is the source of truth: GitHub Actions secrets are write-only
 * (they can never be read back), so both Supabase Auth and the GH secrets are
 * consumers pushed to FROM `.env.local`. Pass --sync-github to also overwrite
 * the E2E_*_PASSWORD repo secrets (via `gh secret set`, value over stdin) so
 * all three stores align in one command.
 *
 * Run from apps/myk9show (local only — never CI; the service-role key must
 * not leave this machine):
 *   pnpm reset:e2e-passwords                  # all roles
 *   pnpm reset:e2e-passwords -- --dry-run     # report drift, write nothing
 *   pnpm reset:e2e-passwords -- --sync-github # also push GH Actions secrets
 *   pnpm reset:e2e-passwords -- secretary judge
 *
 * Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 * from the environment, falling back to .env, and E2E_* credentials falling
 * back to .env.local. Never prints passwords.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  ALL_ROLES,
  parseEnvFile,
  resolveAccounts,
  type E2EAccount,
} from '../src/test/e2e-helpers/resetE2ePasswords';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const file of ['.env', '.env.local']) {
    const path = join(appDir, file);
    if (existsSync(path)) Object.assign(env, parseEnvFile(readFileSync(path, 'utf8')));
  }
  // Real environment wins over dotenv files.
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && value !== '') env[key] = value;
  }
  return env;
}

function requireVar(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name} (set it in apps/myk9show/.env or the environment)`);
  return value;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const syncGithub = args.includes('--sync-github');
const roles = args.filter(arg => !arg.startsWith('--'));

const env = loadEnv();
const url = requireVar(env, 'VITE_SUPABASE_URL');
const anonKey = requireVar(env, 'VITE_SUPABASE_ANON_KEY');
const accounts = resolveAccounts(env, roles.length > 0 ? roles : ALL_ROLES);

const noSession = { auth: { autoRefreshToken: false, persistSession: false } } as const;
const anonClient = createClient(url, anonKey, noSession);

async function passwordWorks(account: E2EAccount): Promise<boolean> {
  const { error } = await anonClient.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  return error === null;
}

async function findUserId(
  admin: ReturnType<typeof createClient>,
  email: string
): Promise<string | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find(user => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Overwrite a repo secret via `gh secret set`, passing the value over stdin so
 * it never appears in argv/process listings. GH secrets are write-only, so
 * "sync" can only ever mean overwrite-from-.env.local.
 */
function pushGithubSecret(name: string, value: string): boolean {
  const result = spawnSync('gh', ['secret', 'set', name], { input: value, encoding: 'utf8' });
  if (result.status === 0) return true;
  console.error(`FAILED   gh secret set ${name} — ${result.stderr?.trim() || 'unknown error'}`);
  return false;
}

let drifted = 0;
let failed = 0;
const verified: E2EAccount[] = [];

for (const account of accounts) {
  const label = `${account.role} (${account.email})`;

  if (await passwordWorks(account)) {
    console.log(`OK       ${label} — password already valid, skipped`);
    verified.push(account);
    continue;
  }

  drifted += 1;
  if (dryRun) {
    console.log(`DRIFTED  ${label} — would reset (dry run)`);
    continue;
  }

  // Create the admin client lazily so --dry-run and all-valid runs never
  // require the service-role key at all.
  const admin = createClient(url, requireVar(env, 'SUPABASE_SERVICE_ROLE_KEY'), noSession);

  const userId = await findUserId(admin, account.email);
  if (!userId) {
    console.error(`MISSING  ${label} — no auth.users row; account must be recreated, not reset`);
    failed += 1;
    continue;
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: account.password,
  });
  if (error) {
    console.error(`FAILED   ${label} — ${error.message}`);
    failed += 1;
    continue;
  }

  if (await passwordWorks(account)) {
    console.log(`RESET    ${label} — password updated and sign-in verified`);
    verified.push(account);
  } else {
    console.error(`FAILED   ${label} — reset applied but sign-in still rejected`);
    failed += 1;
  }
}

if (syncGithub && !dryRun) {
  const secrets = new Map(verified.map(account => [account.passwordVar, account.password]));
  for (const [name, value] of secrets) {
    if (pushGithubSecret(name, value)) {
      console.log(`SYNCED   GitHub secret ${name}`);
    } else {
      failed += 1;
    }
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else if (dryRun && drifted > 0) {
  console.log(`\n${drifted} account(s) drifted — re-run without --dry-run to fix`);
  process.exitCode = 1;
} else {
  console.log('\nAll requested e2e accounts verified.');
}
