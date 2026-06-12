/**
 * Live RLS smoke check: the secretary test user can SELECT from entries and
 * dogs (including the entries→dogs embed) without an RLS policy error.
 *
 * Regression guard for the 42P17 "infinite recursion detected in policy for
 * relation \"dogs\"" outage (2026-06-12): migration 20260611130000 embedded an
 * inline EXISTS on entries inside dogs_select while entries_select joins dogs,
 * creating a structural policy cycle that broke every authenticated dogs /
 * entries read (and with it the replication sync). Fixed by migration
 * 20260612090000 (SECURITY DEFINER helper). This script signs in as the
 * secretary E2E user and replays the reads that failed.
 *
 * Run: pnpm qa:rls-smoke [showId]
 * Credentials: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the environment,
 * falling back to apps/myk9show/.env. User overridable via E2E_SECRETARY_EMAIL /
 * E2E_SECRETARY_PASSWORD (defaults match src/test/e2e/helpers/testUsers.ts).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';

export interface SmokeQuery {
  label: string;
  /** Path + query string under {url}/rest/v1/ */
  path: string;
}

export interface FailureClassification {
  recursion: boolean;
  summary: string;
}

/** Minimal dotenv-style parser: KEY=value lines, ignores comments/blanks. */
export function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/** The reads the replication sync + setup page perform that the outage broke. */
export function buildSmokeQueries(showId: string): SmokeQuery[] {
  return [
    {
      label: `entries for show ${showId}`,
      path: `entries?select=id,dog_id&show_id=eq.${showId}&limit=5`,
    },
    {
      label: 'dogs (replication-style select)',
      path: 'dogs?select=id,call_name&limit=5',
    },
    {
      label: 'entries with embedded dogs (cross-policy join)',
      path: `entries?select=id,dogs(id)&show_id=eq.${showId}&limit=5`,
    },
  ];
}

/** Distinguish the recursion regression from other PostgREST failures. */
export function classifyPostgrestFailure(
  status: number,
  body: string
): FailureClassification {
  let code = '';
  let message = '';
  try {
    const parsed = JSON.parse(body) as { code?: string; message?: string };
    code = parsed.code ?? '';
    message = parsed.message ?? '';
  } catch {
    message = body.slice(0, 200);
  }
  const recursion =
    code === '42P17' || /infinite recursion detected in policy/i.test(message);
  const summary = recursion
    ? `RLS POLICY RECURSION (42P17): ${message} — the dogs/entries policy cycle is back; see migration 20260612090000.`
    : `HTTP ${status}${code ? ` code=${code}` : ''}: ${message}`;
  return { recursion, summary };
}

function resolveConfig(): { url: string; anonKey: string } {
  let url = process.env.VITE_SUPABASE_URL ?? '';
  let anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';
  if (!url || !anonKey) {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const envPath = join(repoRoot, 'apps', 'myk9show', '.env');
    if (existsSync(envPath)) {
      const fileEnv = parseEnvFile(readFileSync(envPath, 'utf8'));
      url ||= fileEnv.VITE_SUPABASE_URL ?? '';
      anonKey ||= fileEnv.VITE_SUPABASE_ANON_KEY ?? '';
    }
  }
  if (!url || !anonKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (env or apps/myk9show/.env)'
    );
  }
  return { url: url.replace(/\/$/, ''), anonKey };
}

async function signIn(url: string, anonKey: string): Promise<string> {
  const email = process.env.E2E_SECRETARY_EMAIL ?? 'secretary@myk9t.com';
  const password = process.env.E2E_SECRETARY_PASSWORD ?? 'TestPass4567!';
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Sign-in failed for ${email}: HTTP ${res.status} ${await res.text()}`);
  }
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

async function main(): Promise<void> {
  const showId = process.argv[2] ?? DEFAULT_SHOW_ID;
  const { url, anonKey } = resolveConfig();
  const token = await signIn(url, anonKey);
  console.log(`Signed in as secretary; running RLS smoke against ${url}`);

  let failed = false;
  for (const query of buildSmokeQueries(showId)) {
    const res = await fetch(`${url}/rest/v1/${query.path}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    const body = await res.text();
    if (res.ok) {
      const rows = JSON.parse(body) as unknown[];
      console.log(`  PASS ${query.label} (${rows.length} rows)`);
    } else {
      failed = true;
      const { summary } = classifyPostgrestFailure(res.status, body);
      console.error(`  FAIL ${query.label}: ${summary}`);
    }
  }

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log('RLS smoke check passed: secretary can read entries + dogs.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
