import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decryptFile } from './decrypt';
import { encryptPayload, sha256 } from './export-model';

describe('local encrypted artifact validation', () => {
  it('decrypts a ciphertext only after its digest matches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'myk9-decrypt-test-'));
    const key = Buffer.alloc(32, 3);
    const payload = encryptPayload(Buffer.from('fixture dump'), key, Buffer.alloc(12, 4));
    const encoded = Buffer.concat([payload.iv, payload.authTag, payload.ciphertext]);
    const path = join(dir, 'dump.enc');
    writeFileSync(path, encoded);
    expect(decryptFile(path, sha256(encoded), key).toString()).toBe('fixture dump');
    expect(() => decryptFile(path, '0'.repeat(64), key)).toThrow(/checksum/);
  });

  it('round trips through the CLI and leaves no plaintext on wrong-key failure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'myk9-decrypt-cli-'));
    const key = Buffer.alloc(32, 8);
    const dumpPayload = encryptPayload(Buffer.from('fixture dump'), key, Buffer.alloc(12, 5));
    const globalsPayload = encryptPayload(
      Buffer.from('CREATE ROLE fixture;'),
      key,
      Buffer.alloc(12, 6)
    );
    const encode = (payload: typeof dumpPayload) =>
      Buffer.concat([payload.iv, payload.authTag, payload.ciphertext]);
    const dump = encode(dumpPayload);
    const globals = encode(globalsPayload);
    const dumpPath = join(dir, 'dump.enc');
    const globalsPath = join(dir, 'globals.enc');
    const manifestPath = join(dir, 'manifest.json');
    writeFileSync(dumpPath, dump);
    writeFileSync(globalsPath, globals);
    writeFileSync(
      manifestPath,
      JSON.stringify({
        format: 'myk9-postgres-export-v1',
        projectRef: 'fixture',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        dumpBytes: dump.length,
        globalsBytes: globals.length,
        dumpSha256: sha256(dump),
        globalsSha256: sha256(globals),
        dumpKey: 'fixture/dump.enc',
        globalsKey: 'fixture/globals.enc',
        pgDumpVersion: 'pg_dump (PostgreSQL) 18.3',
        pgDumpallVersion: 'pg_dumpall (PostgreSQL) 18.3',
      })
    );
    const output = join(dir, 'out');
    const args = [
      '--import',
      'tsx',
      'scripts/backup/decrypt.ts',
      '--manifest',
      manifestPath,
      '--dump',
      dumpPath,
      '--globals',
      globalsPath,
      '--out-dir',
      output,
    ];
    execFileSync(process.execPath, args, {
      env: { ...process.env, BACKUP_ENCRYPTION_KEY: key.toString('base64') },
    });
    expect(readFileSync(join(output, 'database.dump'), 'utf8')).toBe('fixture dump');
    const failedOutput = join(dir, 'wrong-key');
    expect(() =>
      execFileSync(process.execPath, [...args.slice(0, -1), failedOutput], {
        env: { ...process.env, BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64') },
      })
    ).toThrow();
    expect(existsSync(join(failedOutput, 'database.dump'))).toBe(false);
  });

  it('rejects missing and unknown CLI options', () => {
    const run = (args: string[]) =>
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/backup/decrypt.ts', ...args], {
        env: { ...process.env, BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64') },
      });
    expect(() => run(['--manifest', 'fixture.json'])).toThrow();
    expect(() =>
      run([
        '--manifest',
        'fixture.json',
        '--dump',
        'dump.enc',
        '--globals',
        'globals.enc',
        '--out-dir',
        'out',
        '--typo',
      ])
    ).toThrow();
  });
});
