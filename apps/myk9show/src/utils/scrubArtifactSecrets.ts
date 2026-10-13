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
import { unzipSync, zipSync } from 'fflate';

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

/**
 * The spellings a secret takes in a stored artifact: verbatim, and JSON-escaped
 * (the HTML reporter's report.json and every `.json` file write `"` and `\\` as
 * escapes, so a password containing either would slip past a verbatim match).
 */
export function secretForms(secret: string): string[] {
  const escaped = JSON.stringify(secret).slice(1, -1);
  return escaped === secret ? [secret] : [secret, escaped];
}

export function scrubSecrets(text: string, secrets: readonly string[]): string {
  // Longest spelling first, across every secret: a verbatim spelling can be a prefix
  // of its own JSON-escaped spelling (a trailing backslash) or of another secret, and
  // replacing the shorter one first leaves a fragment behind that can break the JSON.
  const forms = [...new Set(secrets.flatMap(secretForms))].sort((a, b) => b.length - a.length);
  let out = text;
  for (const form of forms) out = out.split(form).join('***REDACTED***');
  return out;
}

/**
 * MYK9-1128. The HTML reporter does not store per-test data (step titles such as
 * `Fill "<password>"`) as text: it appends a base64 ZIP to index.html inside
 * `<template id="playwrightReportBase64">` (playwright lib/runner `_writeReportData`).
 * Plain-text scrubbing of index.html cannot see inside it. This decodes that zip,
 * scrubs every entry (recursing into nested zips), re-zips and re-encodes it.
 */
export const REPORT_TEMPLATE =
  /(<template id="playwrightReportBase64">data:application\/zip;base64,)([^<]*)(<\/template>)/;

/** Scrubs every entry of a zip; returns the input untouched when nothing matched. */
export function scrubZip(zip: Uint8Array, secrets: readonly string[]): Uint8Array {
  const entries = unzipSync(zip);
  let changed = false;
  const out: Record<string, Uint8Array<ArrayBufferLike>> = {};
  for (const [name, data] of Object.entries(entries)) {
    let next: Uint8Array = data;
    if (name.endsWith('.zip')) {
      next = scrubZip(data, secrets);
    } else {
      const text = Buffer.from(data).toString('utf8');
      const scrubbed = scrubSecrets(text, secrets);
      if (scrubbed !== text) next = Buffer.from(scrubbed, 'utf8');
    }
    if (next !== data) changed = true;
    out[name] = next;
  }
  return changed ? zipSync(out) : zip;
}

/** Scrubs the report data embedded in an HTML report; other HTML is just text-scrubbed. */
export function scrubReportHtml(html: string, secrets: readonly string[]): string {
  const match = REPORT_TEMPLATE.exec(html);
  let out = html;
  if (match) {
    const zip = new Uint8Array(Buffer.from(match[2], 'base64'));
    const scrubbed = scrubZip(zip, secrets);
    if (scrubbed !== zip) {
      const encoded = Buffer.from(scrubbed).toString('base64');
      out =
        html.slice(0, match.index) +
        match[1] +
        encoded +
        match[3] +
        html.slice(match.index + match[0].length);
    }
  }
  return scrubSecrets(out, secrets);
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
      const scrubbed = file.endsWith('.html')
        ? scrubReportHtml(original, secrets)
        : scrubSecrets(original, secrets);
      if (scrubbed !== original) await writeFile(file, scrubbed, 'utf8');
    }
  }
}
