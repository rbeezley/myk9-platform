import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readManifest } from './latest-manifest';
import { parseObjectList } from './object-list';
import { redactError } from './export-model';
import { retentionCandidates } from './retention-model';
import { exportPrefix } from './export-config';
import { run } from './export';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

function aws(args: string[]): string {
  return run('aws', args, process.env);
}

export function runRetention(): void {
  const bucket = required('BACKUP_BUCKET');
  const projectRef = required('BACKUP_PROJECT_REF');
  const prefix = exportPrefix();
  const days = Number(process.env.BACKUP_RETENTION_DAYS || 30);
  if (!Number.isInteger(days) || days < 1)
    throw new Error('BACKUP_RETENTION_DAYS must be a positive integer');
  const endpoint = process.env.BACKUP_S3_ENDPOINT;
  const endpointArgs = endpoint ? ['--endpoint-url', endpoint] : [];
  const listed = parseObjectList(
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
  );
  const snapshotTimes = new Map<string, number>();
  for (const object of listed.Contents ?? []) {
    if (object.Key?.endsWith('/manifest.json')) {
      const manifest = readManifest(aws, bucket, prefix, projectRef, endpointArgs, object.Key);
      snapshotTimes.set(
        object.Key.slice(0, -'/manifest.json'.length),
        Date.parse(manifest.createdAt)
      );
    }
  }
  const cutoff = Date.now() - days * 86_400_000;
  const selected = retentionCandidates(listed.Contents || [], cutoff, snapshotTimes);
  const apply = process.env.BACKUP_RETENTION_APPLY === 'true';
  if (apply && process.env.BACKUP_RETENTION_CONFIRM !== `DELETE ${bucket}/${prefix}`) {
    throw new Error(
      'retention deletion requires BACKUP_RETENTION_CONFIRM="DELETE <bucket>/<prefix>"'
    );
  }
  if (apply) {
    for (const key of selected)
      aws(['s3api', 'delete-object', '--bucket', bucket, '--key', key, ...endpointArgs]);
  }
  console.log(
    JSON.stringify({ mode: apply ? 'deleted' : 'dry-run', bucket, prefix, days, selected })
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runRetention();
  } catch (error) {
    console.error(redactError(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
