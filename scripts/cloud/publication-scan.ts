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
 * The shared scanner treats a directory it cannot list as "not produced" and
 * skips it, which is right for E2E reports. Here skipped content is
 * unscanned content, so list every directory first and let any failure throw.
 */
async function assertFullyListable(dir: string, readdir: Readdir): Promise<void> {
  for (const entry of await readdir(dir)) {
    if (entry.isDirectory()) await assertFullyListable(join(dir, entry.name), readdir);
  }
}

export async function scanForPublication(options: {
  dirs: readonly string[];
  texts: readonly string[];
  env: Record<string, string | undefined>;
  /** Test seam for directory listing; defaults to node:fs. */
  readdir?: Readdir;
}): Promise<PublicationScan> {
  const secrets = collectSecrets(options.env);
  try {
    for (const dir of options.dirs) {
      if (!(await stat(dir)).isDirectory()) throw new Error(`${dir} is not a directory`);
      await assertFullyListable(dir, options.readdir ?? defaultReaddir);
    }
    // A file can be named after the secret it holds, so locations are scrubbed too.
    const locations = (await findArtifactSecrets(options.dirs, secrets)).map(finding =>
      scrubSecrets(finding.location, secrets)
    );
    options.texts.forEach((text, index) => {
      if (secrets.some(secret => secretForms(secret).some(form => text.includes(form)))) {
        locations.push(`text[${index}]`);
      }
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
