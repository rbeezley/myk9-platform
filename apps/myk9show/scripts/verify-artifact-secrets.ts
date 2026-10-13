/**
 * MYK9-1128. CI gate run BEFORE each Playwright artifact upload:
 *   pnpm exec tsx scripts/verify-artifact-secrets.ts [--skip-zip-files] <dir>...
 * Exits 1 when any configured secret (same `collectSecrets()` env rule as the
 * scrubber) is still present in the directories, printing file names and counts only.
 * Never prints a value.
 */
import { pathToFileURL } from 'node:url';
import { findArtifactSecrets } from '../src/utils/findArtifactSecrets';
import { collectSecrets } from '../src/utils/scrubArtifactSecrets';

export async function run(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const skipZipFiles = argv.includes('--skip-zip-files');
  const dirs = argv.filter(arg => !arg.startsWith('--'));
  if (dirs.length === 0) {
    console.error('verify-artifact-secrets: no directories given');
    return 2;
  }
  const secrets = collectSecrets(env);
  const findings = await findArtifactSecrets(dirs, secrets, { skipZipFiles });
  if (findings.length === 0) {
    console.log(
      `verify-artifact-secrets: clean (${secrets.length} configured secret(s), ${dirs.length} dir(s))`
    );
    return 0;
  }
  for (const finding of findings) {
    console.error(`LEAK: ${finding.location} (${finding.hits} occurrence(s))`);
  }
  console.error(
    `verify-artifact-secrets: ${findings.length} location(s) still carry a configured secret; refusing to publish`
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2), process.env).then(
    code => process.exit(code),
    err => {
      console.error('verify-artifact-secrets: failed', err instanceof Error ? err.message : '');
      process.exit(2);
    }
  );
}
