import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cadenceForDay,
  isPastDue,
  latestDueSlot,
  assertManifest,
  redactError,
  sha256,
  weekdayInTimeZone,
} from './export-model';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function aws(args: string[]): string {
  try {
    return execFileSync('aws', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new Error(redactError(error instanceof Error ? error.message : String(error)));
  }
}

function main(): void {
  const bucket = required('BACKUP_BUCKET');
  const projectRef = required('BACKUP_PROJECT_REF');
  const prefix = (process.env.BACKUP_PREFIX ?? 'myk9/database').replace(/^\/|\/$/g, '');
  const graceMinutes = Number(process.env.BACKUP_GRACE_MINUTES ?? 30);
  const endpoint = process.env.BACKUP_S3_ENDPOINT;
  const timeZone = process.env.BACKUP_TIME_ZONE || 'UTC';
  const weekendDays = (process.env.BACKUP_WEEKEND_DAYS || '0,5,6').split(',').map(Number);
  const endpointArgs = endpoint ? ['--endpoint-url', endpoint] : [];
  const listed = JSON.parse(
    aws([
      's3api',
      'list-objects-v2',
      '--bucket',
      bucket,
      '--prefix',
      `${prefix}/`,
      '--output',
      'json',
      ...endpointArgs,
    ])
  ) as { Contents?: Array<{ Key?: string }> };
  const manifestKeys = (listed.Contents ?? [])
    .map(item => item.Key)
    .filter((key): key is string => Boolean(key?.endsWith('/manifest.json')));
  const manifests = manifestKeys
    .map(key => {
      const raw = aws([
        's3',
        'cp',
        `s3://${bucket}/${key}`,
        '-',
        '--only-show-errors',
        ...endpointArgs,
      ]);
      const manifest: unknown = JSON.parse(raw);
      assertManifest(manifest);
      return manifest;
    })
    .filter(manifest => manifest.projectRef === projectRef);
  const latest = manifests.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (!latest) throw new Error(`no successful manifest found for project ${projectRef}`);
  const scratch = mkdtempSync(join(tmpdir(), 'myk9-verify-'));
  try {
    for (const [objectKey, expectedBytes, expectedDigest] of [
      [latest.dumpKey, latest.dumpBytes, latest.dumpSha256],
      [latest.globalsKey, latest.globalsBytes, latest.globalsSha256],
    ] as const) {
      const target = join(scratch, sha256(Buffer.from(objectKey)));
      const copyArgs = [
        's3',
        'cp',
        `s3://${bucket}/${objectKey}`,
        target,
        '--only-show-errors',
        ...endpointArgs,
      ];
      aws(copyArgs);
      if (
        statSync(target).size !== expectedBytes ||
        sha256(readFileSync(target)) !== expectedDigest
      )
        throw new Error(`payload verification failed for ${objectKey}`);
    }
    const now = new Date();
    const cadence = cadenceForDay(weekdayInTimeZone(now, timeZone), weekendDays);
    const nightlyHour = Number(process.env.BACKUP_NIGHTLY_HOUR || 3);
    const dueSlot = latestDueSlot(now, timeZone, weekendDays, nightlyHour, graceMinutes);
    if (isPastDue(latest.createdAt, dueSlot)) {
      throw new Error(
        `latest export missed due slot ${dueSlot.toISOString()}: ${latest.createdAt} (${cadence} cadence)`
      );
    }
    console.log(
      JSON.stringify({
        status: 'fresh',
        projectRef,
        createdAt: latest.createdAt,
        cadence,
        timeZone,
      })
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(redactError(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
