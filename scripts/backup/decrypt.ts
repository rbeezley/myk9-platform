import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assertManifest, decryptPayload, parseEncryptionKey, sha256 } from './export-model';

const CLI_OPTIONS = ['--manifest', '--dump', '--globals', '--out-dir'] as const;
type CliOption = (typeof CLI_OPTIONS)[number];

function parseArgs(argv: string[]): Record<CliOption, string> {
  const values = {} as Record<CliOption, string>;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!CLI_OPTIONS.includes(option as CliOption)) throw new Error(`unknown option: ${option}`);
    const name = option as CliOption;
    if (name in values) throw new Error(`${name} may only be provided once`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} is required`);
    values[name] = value;
    index += 1;
  }
  for (const name of CLI_OPTIONS) {
    if (!(name in values)) throw new Error(`${name} is required`);
  }
  return values;
}

export function decryptFile(path: string, expectedDigest: string, key: Buffer): Buffer {
  const encoded = readFileSync(path);
  if (sha256(encoded) !== expectedDigest) throw new Error(`checksum mismatch: ${path}`);
  if (encoded.length <= 28) throw new Error(`encrypted payload is empty: ${path}`);
  return decryptPayload(
    {
      iv: encoded.subarray(0, 12),
      authTag: encoded.subarray(12, 28),
      ciphertext: encoded.subarray(28),
    },
    key
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(args['--manifest']);
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assertManifest(manifest);
  const key = parseEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  const outDir = resolve(args['--out-dir']);
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const dump = decryptFile(args['--dump'], manifest.dumpSha256, key);
  const globals = decryptFile(args['--globals'], manifest.globalsSha256, key);
  if (!dump.length || !globals.length) throw new Error('decrypted payload is empty');
  writeFileSync(resolve(outDir, 'database.dump'), dump, { mode: 0o600 });
  writeFileSync(resolve(outDir, 'globals.sql'), globals, { mode: 0o600 });
  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(JSON.stringify({ status: 'decrypted', outDir, projectRef: manifest.projectRef }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
