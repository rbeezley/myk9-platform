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

const RUN_DIR = path.join(os.tmpdir(), 'myk9-e2e-sessions', String(process.ppid));

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
async function stillSignedIn(saved: SavedSession): Promise<boolean> {
  const env = supabaseEnv();
  const token = readSessionToken(saved.value);
  if (!env || !token) return false;
  const response = await fetch(`${env.url}/auth/v1/user`, {
    headers: { apikey: env.anonKey, Authorization: `Bearer ${token.accessToken}` },
  }).catch(() => null);
  return response?.ok === true;
}

/**
 * Put the account's saved session in the page and open `returnTo`. Returns
 * false, leaving the page signed out, when there is nothing usable to restore.
 */
export async function restoreSharedSession(
  page: Page,
  email: string,
  returnTo: string
): Promise<boolean> {
  const saved = await readSaved(email);
  if (!saved || !isReusableSession(saved, Date.now())) return false;
  if (!(await stillSignedIn(saved))) {
    await forget(email);
    return false;
  }

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), saved);
  await page.goto(returnTo, { waitUntil: 'domcontentloaded' });
  if (!new URL(page.url()).pathname.includes('/sign-in')) return true;

  // The app did not accept it; leave the page as a form sign-in expects it.
  await page.evaluate(key => localStorage.removeItem(key), saved.key);
  await forget(email);
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

  await fs.mkdir(RUN_DIR, { recursive: true, mode: 0o700 });
  // Write then rename, so a worker reading at the same moment never sees half a file.
  const temporary = `${sessionFile(email)}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(saved), { mode: 0o600 });
  await fs.rename(temporary, sessionFile(email));
}
