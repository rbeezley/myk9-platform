/**
 * One saved sign-in per test account per Playwright run (MYK9-1056).
 *
 * `signIn` restores the account's saved supabase-js session when there is a
 * usable one and signs in through the form otherwise, saving what it got. The
 * reuse rules are in `../../e2e-helpers/sharedSessionPolicy`.
 *
 * The files hold live tokens, so they go to a per-run directory under the OS
 * temp dir with owner-only permissions, never under `test-results/`: CI uploads
 * that as an artifact and the repository is public. A run is identified by the
 * Playwright runner's pid, which every worker shares as its parent.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type Page } from '@playwright/test';

import { SUPABASE_AUTH_TOKEN_KEY_PATTERN } from '../../e2e-helpers/signInDiagnostics';
import {
  isReusableSession,
  readSessionToken,
  type SavedSession,
  sharedSessionFileName,
} from '../../e2e-helpers/sharedSessionPolicy';

const SESSIONS_DIR = path.join(os.tmpdir(), 'myk9-e2e-sessions');
const RUN_DIR = path.join(SESSIONS_DIR, String(process.ppid));
/** Earlier runs' directories older than this are removed: their tokens are past use. */
const STALE_RUN_DIR_MS = 2 * 60 * 60 * 1000;
/** How long a restore lets the app settle before judging whether it kept the session. */
const RESTORE_SETTLE_MS = 5_000;
const USER_CHECK_TIMEOUT_MS = 5_000;

/** Remove earlier runs' saved tokens; nothing else signs them out or deletes them. */
async function removeStaleRunDirs(): Promise<void> {
  const entries = await fs.readdir(SESSIONS_DIR).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter(entry => entry !== String(process.ppid))
      .map(async entry => {
        const dir = path.join(SESSIONS_DIR, entry);
        const stat = await fs.stat(dir).catch(() => null);
        if (stat && Date.now() - stat.mtimeMs > STALE_RUN_DIR_MS) {
          await fs.rm(dir, { recursive: true, force: true });
        }
      })
  );
}

function sessionFile(email: string): string {
  return path.join(RUN_DIR, sharedSessionFileName(email));
}

/** Reuse needs the project URL and anon key to ask Supabase whether a token still stands. */
function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  return url && anonKey ? { url: url.replace(/\/$/, ''), anonKey } : null;
}

async function readSaved(email: string): Promise<SavedSession | null> {
  try {
    return JSON.parse(await fs.readFile(sessionFile(email), 'utf8')) as SavedSession;
  } catch {
    return null;
  }
}

async function forget(email: string): Promise<void> {
  await fs.rm(sessionFile(email), { force: true });
}

/**
 * A spec that signs out (the app signs out globally) revokes the session for
 * every holder, while its access token keeps verifying locally until expiry.
 * Ask the auth server, which knows, before handing the token to another spec.
 */
async function sessionStatus(saved: SavedSession): Promise<'valid' | 'revoked' | 'unknown'> {
  const env = supabaseEnv();
  const token = readSessionToken(saved.value);
  if (!env || !token) return 'unknown';
  const response = await fetch(`${env.url}/auth/v1/user`, {
    headers: { apikey: env.anonKey, Authorization: `Bearer ${token.accessToken}` },
    signal: AbortSignal.timeout(USER_CHECK_TIMEOUT_MS),
  }).catch(() => null);
  if (response?.ok) return 'valid';
  // Only the server's "no" retires the file for every worker. A blip (429, 5xx,
  // timeout) sends just this sign-in to the form, or every worker would at once.
  return response?.status === 401 || response?.status === 403 ? 'revoked' : 'unknown';
}

/**
 * Put the account's saved session in the page and open `returnTo`. Returns
 * false, leaving the page signed out, when there is nothing usable to restore
 * or anything about restoring it fails: the form sign-in is always the fallback.
 */
export async function restoreSharedSession(
  page: Page,
  email: string,
  returnTo: string
): Promise<boolean> {
  const saved = await readSaved(email);
  if (!saved || !isReusableSession(saved, Date.now())) return false;
  const status = await sessionStatus(saved);
  if (status === 'revoked') await forget(email);
  if (status !== 'valid') return false;

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), saved);
    await page.goto(returnTo, { waitUntil: 'domcontentloaded' });
    // The app decides auth after boot; give a bounce to /sign-in time to happen.
    await page.waitForLoadState('networkidle', { timeout: RESTORE_SETTLE_MS }).catch(() => {});
    if (!new URL(page.url()).pathname.includes('/sign-in')) return true;
  } catch {
    // Any failure here falls back to the caller's form sign-in.
  }

  await page.evaluate(key => localStorage.removeItem(key), saved.key).catch(() => {});
  return false;
}

/** Save the session a form sign-in just produced, for the run's later specs. */
export async function saveSharedSession(page: Page, email: string): Promise<void> {
  if (!supabaseEnv()) return;
  const saved = await page.evaluate(pattern => {
    const key = Object.keys(localStorage).find(candidate => new RegExp(pattern).test(candidate));
    const value = key ? localStorage.getItem(key) : null;
    return key && value ? { key, value } : null;
  }, SUPABASE_AUTH_TOKEN_KEY_PATTERN);
  if (!saved || !isReusableSession(saved, Date.now())) return;

  await removeStaleRunDirs();
  await fs.mkdir(RUN_DIR, { recursive: true, mode: 0o700 });
  // Write then rename, so a worker reading at the same moment never sees half a file.
  const temporary = `${sessionFile(email)}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(saved), { mode: 0o600 });
  await fs.rename(temporary, sessionFile(email));
}
