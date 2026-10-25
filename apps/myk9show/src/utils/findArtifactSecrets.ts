/**
 * MYK9-1128. Read-only counterpart of `scrubArtifactSecrets`: reports WHERE a
 * configured secret still sits in an artifact directory, never the value. CI runs it
 * (scripts/verify-artifact-secrets.ts) before each Playwright artifact upload so a
 * scrubber gap fails the job instead of publishing the secret to a public artifact.
 *
 * It deliberately re-implements nothing from the scrubber's file-type logic: it
 * looks at EVERY file's bytes, and additionally opens zips (the HTML report's
 * embedded `playwrightReportBase64` template, and any `.zip` file) because deflated
 * bytes cannot match a plaintext secret.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { REPORT_TEMPLATE, scrubSecrets, secretForms } from './scrubArtifactSecrets';

export interface SecretFinding {
  /** Path relative to the scanned directory, with `!` + entry name for zip entries. */
  location: string;
  hits: number;
}

function countHits(data: Uint8Array, secrets: readonly string[]): number {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  let hits = 0;
  for (const secret of secrets) {
    for (const form of secretForms(secret)) {
      for (let at = buf.indexOf(form); at !== -1; at = buf.indexOf(form, at + form.length)) hits++;
    }
  }
  return hits;
}

function scanZip(
  zip: Uint8Array,
  location: string,
  secrets: readonly string[],
  out: SecretFinding[]
): void {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    // An unreadable archive cannot be proven clean.
    out.push({ location: `${location} (unreadable zip)`, hits: 1 });
    return;
  }
  for (const [name, data] of Object.entries(entries)) {
    const where = `${location}!${name}`;
    if (name.endsWith('.zip')) scanZip(data, where, secrets, out);
    // An entry's name is published with the archive, so it is scanned like its
    // bytes. Deflated entry names are stored as plain text, but an EMBEDDED
    // archive is base64, so only the decoded name can be matched.
    const hits = countHits(data, secrets) + countHits(Buffer.from(name), secrets);
    if (hits > 0) out.push({ location: where, hits });
  }
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // directory not produced
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/**
 * `skipZipFiles` mirrors the upload steps' `!**\/*.zip` exclusion: trace archives are
 * never published, so a secret inside one is not a leak. Zips EMBEDDED in an HTML
 * report are always opened, because those ARE published.
 */
export async function findArtifactSecrets(
  dirs: readonly string[],
  secrets: readonly string[],
  options: { skipZipFiles?: boolean } = {}
): Promise<SecretFinding[]> {
  const findings: SecretFinding[] = [];
  if (secrets.length === 0) return findings;
  for (const dir of dirs) {
    for await (const file of walk(dir)) {
      const isZip = file.endsWith('.zip');
      if (isZip && options.skipZipFiles) continue;
      const data = await readFile(file);
      const location = path.relative(dir, file) || path.basename(file);
      const hits = countHits(data, secrets);
      if (hits > 0) findings.push({ location, hits });
      if (isZip) scanZip(data, location, secrets, findings);
      else if (file.endsWith('.html')) {
        const match = REPORT_TEMPLATE.exec(data.toString('utf8'));
        if (match) {
          scanZip(
            new Uint8Array(Buffer.from(match[2], 'base64')),
            `${location}#report`,
            secrets,
            findings
          );
        }
      }
    }
  }
  // A location is a path, and a path can be the secret itself: callers print
  // these, so no value ever leaves this function.
  return findings.map(finding => ({
    ...finding,
    location: scrubSecrets(finding.location, secrets),
  }));
}
