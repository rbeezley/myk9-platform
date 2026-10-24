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
import { stat } from 'node:fs/promises';
import { findArtifactSecrets } from '../../apps/myk9show/src/utils/findArtifactSecrets.ts';
import {
  collectSecrets,
  scrubSecrets,
  secretForms,
} from '../../apps/myk9show/src/utils/scrubArtifactSecrets.ts';

export type PublicationScan = { ok: true } | { ok: false; reason: string; locations: string[] };

export async function scanForPublication(options: {
  dirs: readonly string[];
  texts: readonly string[];
  env: Record<string, string | undefined>;
}): Promise<PublicationScan> {
  const secrets = collectSecrets(options.env);
  try {
    // The shared scanner reads an absent directory as "not produced" and skips
    // it, which is right for E2E reports; here a staging directory that is not
    // there means the scan did not happen.
    for (const dir of options.dirs) {
      if (!(await stat(dir)).isDirectory()) throw new Error(`${dir} is not a directory`);
    }
    const locations = (await findArtifactSecrets(options.dirs, secrets)).map(
      finding => finding.location
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
