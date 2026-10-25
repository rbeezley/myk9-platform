/**
 * The gate every handoff upload and published excerpt passes (MYK9-1397;
 * docs/plan-cloud-agent-workflow.md Task 1.2). It reuses the artifact
 * scanner the E2E uploads already trust, over the secret-named variables in
 * the environment (model keys, GitHub and Linear tokens, test passwords).
 *
 * Fail closed: a hit or a scanner error blocks publication, and no caller
 * may fall back to uploading unscanned evidence. Diagnostics name locations
 * and counts only, never a value.
 */
import { readdir as fsReaddir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { findArtifactSecrets } from '../../apps/myk9show/src/utils/findArtifactSecrets.ts';
import {
  collectSecrets,
  scrubSecrets,
  secretForms,
} from '../../apps/myk9show/src/utils/scrubArtifactSecrets.ts';

export type PublicationScan = { ok: true } | { ok: false; reason: string; locations: string[] };

type Readdir = (path: string) => Promise<Dirent[]>;

const defaultReaddir: Readdir = path => fsReaddir(path, { withFileTypes: true });

/**
 * One listing pass over everything that would be published. It screens every
 * file and directory NAME, which travels as archive and listing metadata even
 * when the bytes are clean, and it fails closed on a directory it cannot list:
 * the shared byte scanner treats that as "not produced" and skips it, which is
 * right for E2E reports, but here skipped content is unscanned content.
 */
async function findSecretNames(
  dir: string,
  forms: readonly string[],
  readdir: Readdir,
  prefix = ''
): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir)) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (containsSecret(entry.name, forms)) found.push(relative);
    if (entry.isDirectory()) {
      found.push(...(await findSecretNames(join(dir, entry.name), forms, readdir, relative)));
    }
  }
  return found;
}

/** `forms` is every configured secret in each form it can be written in. */
function containsSecret(text: string, forms: readonly string[]): boolean {
  return forms.some(form => text.includes(form));
}

export async function scanForPublication(options: {
  dirs: readonly string[];
  texts: readonly string[];
  env: Record<string, string | undefined>;
  /** Test seam for directory listing; defaults to node:fs. */
  readdir?: Readdir;
}): Promise<PublicationScan> {
  const secrets = collectSecrets(options.env);
  const forms = secrets.flatMap(secretForms);
  try {
    const named: string[] = [];
    for (const dir of options.dirs) {
      if (!(await stat(dir)).isDirectory()) throw new Error(`${dir} is not a directory`);
      named.push(...(await findSecretNames(dir, forms, options.readdir ?? defaultReaddir)));
    }
    const byContent = (await findArtifactSecrets(options.dirs, secrets)).map(
      finding => finding.location
    );
    // One location per path, whether its name, its bytes or both carry a value;
    // either can be the secret itself, so every location is scrubbed.
    const locations = [...new Set([...named, ...byContent])].map(location =>
      scrubSecrets(location, secrets)
    );
    options.texts.forEach((text, index) => {
      if (containsSecret(text, forms)) locations.push(`text[${index}]`);
    });
    return locations.length === 0
      ? { ok: true }
      : { ok: false, reason: 'secret found; nothing published', locations };
  } catch (error) {
    // A path in the error can itself carry a value, so scrub before reporting.
    const message = scrubSecrets(error instanceof Error ? error.message : String(error), secrets);
    return { ok: false, reason: `scanner error; nothing published: ${message}`, locations: [] };
  }
}
