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

/**
 * Env vars whose VALUES are secrets, matched by NAME pattern rather than a hand-kept
 * list.
 *
 * The list this replaced named six E2E_* passwords and missed
 * E2E_LOAD_SECRETARY_{1,2,3}_PASSWORD, which .github/workflows/load-rehearsal.yml
 * passes -- so a load-rehearsal failure could still publish a password. That is the
 * same hand-maintained-allowlist failure this repo hits elsewhere (see CLAUDE.md on
 * test-runner allowlists): the list passes review, and the next secret nobody
 * remembers to add is exposed silently. A pattern cannot go stale that way.
 *
 * Over-matching is safe here -- scrubbing an extra secret from an artifact costs
 * nothing, while missing one is the bug.
 */
const SECRET_NAME_PATTERN = /(PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY)$/;

/** Values short enough that blind replacement would corrupt unrelated text. */
const MIN_SCRUBBABLE_LENGTH = 6;

export function collectSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const seen = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (!SECRET_NAME_PATTERN.test(name)) continue;
    const trimmed = value?.trim();
    if (trimmed && trimmed.length >= MIN_SCRUBBABLE_LENGTH) seen.add(trimmed);
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
