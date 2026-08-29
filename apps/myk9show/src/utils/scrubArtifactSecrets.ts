/**
 * F10 — Playwright writes `test-results/**\/error-context.md` for a failed test,
 * containing the page's accessibility snapshot. That snapshot includes the value of
 * the filled password field, so a failure left the e2e account password in plaintext
 * on disk — and CI uploads these artifacts on failure.
 *
 * Runs as Playwright's `globalTeardown`, i.e. after the run and before CI's upload
 * step. It scrubs the literal secret values rather than trying to recognise a
 * password field, because the leak is Playwright's snapshot format, not our markup
 * (the input is already `type="password"`), and that format is free to change.
 *
 * Only values actually present in the environment are scrubbed, and short ones are
 * skipped so a trivial local password cannot blank out unrelated text.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SECRET_ENV_VARS = [
  'E2E_ADMIN_PASSWORD',
  'E2E_SECRETARY_PASSWORD',
  'E2E_JUDGE_PASSWORD',
  'E2E_CLUB_ADMIN_PASSWORD',
  'E2E_DEMO_EXHIBITOR_PASSWORD',
  'E2E_EXHIBITOR_PASSWORD',
] as const;

/** Values short enough that blind replacement would corrupt unrelated text. */
const MIN_SCRUBBABLE_LENGTH = 6;

export function collectSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const seen = new Set<string>();
  for (const name of SECRET_ENV_VARS) {
    const value = env[name]?.trim();
    if (value && value.length >= MIN_SCRUBBABLE_LENGTH) seen.add(value);
  }
  return [...seen];
}

export function scrubSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) out = out.split(secret).join('***REDACTED***');
  return out;
}

/**
 * Extensions that can carry a snapshot verbatim. The HTML reporter inlines
 * attachments (error-context.md among them) into its own .json/.html payloads, so
 * scrubbing only .md/.txt under test-results/ leaves the uploaded report untouched.
 */
const SCRUBBABLE_EXTENSIONS = ['.md', '.txt', '.json', '.html'] as const;

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // no artifacts produced
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SCRUBBABLE_EXTENSIONS.some(ext => entry.name.endsWith(ext))) yield full;
  }
}

/**
 * Every artifact root a Playwright config in this repo writes to. CI uploads
 * `playwright-report-ci/` for BOTH the e2e and a11y jobs (ci.yml), and the audit,
 * readiness and load configs each use their own `test-results/<name>` subdirectory --
 * all of which live under these roots.
 */
export const ARTIFACT_ROOTS = ['test-results', 'playwright-report', 'playwright-report-ci'];

export async function scrubArtifactSecrets(...outputDirs: string[]): Promise<void> {
  const secrets = collectSecrets();
  if (secrets.length === 0) return;

  for (const outputDir of outputDirs) {
    for await (const file of walk(outputDir)) {
      const original = await readFile(file, 'utf8');
      const scrubbed = scrubSecrets(original, secrets);
      if (scrubbed !== original) await writeFile(file, scrubbed, 'utf8');
    }
  }
}
