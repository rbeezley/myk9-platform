import { execFileSync } from 'node:child_process';
import { redactError } from './export-model';
import { retentionCandidates } from './retention-model';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

function aws(args: string[]): string {
  try {
    return execFileSync('aws', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new Error(redactError(error instanceof Error ? error.message : String(error)));
  }
}

function main(): void {
  const bucket = required('BACKUP_BUCKET');
  const prefix = (process.env.BACKUP_PREFIX || 'myk9/database').replace(/^\/|\/$/g, '');
  const days = Number(process.env.BACKUP_RETENTION_DAYS || 30);
  if (!Number.isInteger(days) || days < 1)
    throw new Error('BACKUP_RETENTION_DAYS must be a positive integer');
  const endpoint = process.env.BACKUP_S3_ENDPOINT;
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
  ) as {
    Contents?: Array<{ Key?: string; LastModified?: string }>;
  };
  const cutoff = Date.now() - days * 86_400_000;
  const selected = retentionCandidates(listed.Contents || [], cutoff);
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

try {
  main();
} catch (error) {
  console.error(redactError(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
