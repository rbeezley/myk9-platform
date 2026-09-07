import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertManifest, decryptPayload, parseEncryptionKey, sha256 } from './export-model';

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required`);
  return value;
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
  const manifestPath = resolve(arg('--manifest'));
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assertManifest(manifest);
  const key = parseEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  const outDir = resolve(arg('--out-dir'));
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const dump = decryptFile(arg('--dump'), manifest.dumpSha256, key);
  const globals = decryptFile(arg('--globals'), manifest.globalsSha256, key);
  if (!dump.length || !globals.length) throw new Error('decrypted payload is empty');
  writeFileSync(resolve(outDir, 'database.dump'), dump, { mode: 0o600 });
  writeFileSync(resolve(outDir, 'globals.sql'), globals, { mode: 0o600 });
  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(JSON.stringify({ status: 'decrypted', outDir, projectRef: manifest.projectRef }));
}

if (process.argv.includes('--manifest')) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
