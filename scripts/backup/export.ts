import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertManifest,
  createManifest,
  encryptPayload,
  parseEncryptionKey,
  redactError,
  sha256,
  isDueNow,
} from './export-model';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export function run(command: string, args: string[], env: NodeJS.ProcessEnv): string {
  try {
    return execFileSync(command, args, {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${command} failed: ${redactError(detail)}`);
  }
}

export function buildGlobalsDumpArgs(globalsPath: string, databaseUrl: string): string[] {
  return [
    '--globals-only',
    '--no-role-passwords',
    '--file',
    globalsPath,
    '--database',
    databaseUrl,
  ];
}

function upload(
  localPath: string,
  key: string,
  digest: string,
  bucket: string,
  endpoint: string | undefined
): void {
  const args = [
    's3',
    'cp',
    localPath,
    `s3://${bucket}/${key}`,
    '--only-show-errors',
    '--metadata',
    `sha256=${digest}`,
  ];
  if (endpoint) args.push('--endpoint-url', endpoint);
  run('aws', args, process.env);
}

function verifyRemote(
  localPath: string,
  key: string,
  digest: string,
  bucket: string,
  endpoint: string | undefined,
  scratchDir: string
): void {
  const args = ['s3api', 'head-object', '--bucket', bucket, '--key', key, '--output', 'json'];
  if (endpoint) args.push('--endpoint-url', endpoint);
  const response = JSON.parse(run('aws', args, process.env)) as {
    ContentLength?: number;
    Metadata?: { sha256?: string };
  };
  if (response.ContentLength !== statSync(localPath).size || response.Metadata?.sha256 !== digest) {
    throw new Error(`remote verification failed for ${key}`);
  }
  const remotePath = join(scratchDir, `remote-${sha256(Buffer.from(key))}`);
  const copyArgs = ['s3', 'cp', `s3://${bucket}/${key}`, remotePath, '--only-show-errors'];
  if (endpoint) copyArgs.push('--endpoint-url', endpoint);
  run('aws', copyArgs, process.env);
  if (sha256(readFileSync(remotePath)) !== digest)
    throw new Error(`remote bytes failed digest verification for ${key}`);
}

export function exportDatabase(): void {
  const timeZone = process.env.BACKUP_TIME_ZONE || 'UTC';
  const weekendDays = (process.env.BACKUP_WEEKEND_DAYS || '0,5,6').split(',').map(Number);
  const nightlyHour = Number(process.env.BACKUP_NIGHTLY_HOUR || 3);
  if (
    process.env.BACKUP_FORCE_RUN !== 'true' &&
    !isDueNow(new Date(), timeZone, weekendDays, nightlyHour)
  ) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'not-due', timeZone, nightlyHour }));
    return;
  }
  const databaseUrl = required('BACKUP_DATABASE_URL');
  const projectRef = required('BACKUP_PROJECT_REF');
  const bucket = required('BACKUP_BUCKET');
  const prefix = (process.env.BACKUP_PREFIX ?? 'myk9/database').replace(/^\/|\/$/g, '');
  const key = parseEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  const expectedMajor = required('BACKUP_PG_CLIENT_MAJOR');
  const root = mkdtempSync(join(tmpdir(), 'myk9-export-'));
  const dumpPath = join(root, 'database.dump');
  const globalsPath = join(root, 'globals.sql');
  const createdAt = new Date().toISOString();
  try {
    const env = { ...process.env, PGPASSWORD: process.env.BACKUP_DATABASE_PASSWORD };
    const pgDumpVersion = run('pg_dump', ['--version'], env).trim();
    const pgDumpallVersion = run('pg_dumpall', ['--version'], env).trim();
    if (!/^\d+$/.test(expectedMajor)) throw new Error('BACKUP_PG_CLIENT_MAJOR must be numeric');
    const dumpMajor = pgDumpVersion.match(/(\d+)\./)?.[1];
    const dumpallMajor = pgDumpallVersion.match(/(\d+)\./)?.[1];
    if (dumpMajor !== expectedMajor || dumpallMajor !== expectedMajor) {
      throw new Error(`PostgreSQL client major version must be ${expectedMajor}`);
    }
    run('pg_dump', ['--format=custom', '--no-owner', '--file', dumpPath, databaseUrl], env);
    // Supabase-managed roles do not expose password hashes to this export role.
    // Role definitions are retained; provider-managed passwords are recreated on restore.
    run('pg_dumpall', buildGlobalsDumpArgs(globalsPath, databaseUrl), env);
    const dump = readFileSync(dumpPath);
    const globals = readFileSync(globalsPath);
    const encryptedDump = encryptPayload(dump, key);
    const encryptedGlobals = encryptPayload(globals, key);
    const dumpObject = join(root, 'database.dump.enc');
    const globalsObject = join(root, 'globals.sql.enc');
    writeFileSync(
      dumpObject,
      Buffer.concat([encryptedDump.iv, encryptedDump.authTag, encryptedDump.ciphertext]),
      { mode: 0o600 }
    );
    writeFileSync(
      globalsObject,
      Buffer.concat([encryptedGlobals.iv, encryptedGlobals.authTag, encryptedGlobals.ciphertext]),
      { mode: 0o600 }
    );
    const stem = `${prefix}/${createdAt.replace(/[:.]/g, '-')}`;
    const manifest = createManifest({
      projectRef,
      createdAt,
      completedAt: new Date().toISOString(),
      dumpBytes: statSync(dumpObject).size,
      globalsBytes: statSync(globalsObject).size,
      dumpSha256: sha256(readFileSync(dumpObject)),
      globalsSha256: sha256(readFileSync(globalsObject)),
      dumpKey: `${stem}/database.dump.enc`,
      globalsKey: `${stem}/globals.sql.enc`,
      pgDumpVersion,
      pgDumpallVersion,
    });
    assertManifest(manifest);
    const manifestPath = join(root, 'manifest.json');
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    const endpoint = process.env.BACKUP_S3_ENDPOINT;
    const dumpKey = `${stem}/database.dump.enc`;
    const globalsKey = `${stem}/globals.sql.enc`;
    const manifestKey = `${stem}/manifest.json`;
    const manifestDigest = sha256(readFileSync(manifestPath));
    upload(dumpObject, dumpKey, manifest.dumpSha256, bucket, endpoint);
    upload(globalsObject, globalsKey, manifest.globalsSha256, bucket, endpoint);
    verifyRemote(dumpObject, dumpKey, manifest.dumpSha256, bucket, endpoint, root);
    verifyRemote(globalsObject, globalsKey, manifest.globalsSha256, bucket, endpoint, root);
    // Publish the success marker only after both payloads have been verified byte-for-byte.
    upload(manifestPath, manifestKey, manifestDigest, bucket, endpoint);
    verifyRemote(manifestPath, manifestKey, manifestDigest, bucket, endpoint, root);
    console.log(
      JSON.stringify({ status: 'ok', createdAt, projectRef, manifest: `${stem}/manifest.json` })
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
