import { parseObjectList } from './object-list';
import { assertManifest, type ExportManifest } from './export-model';

export class InvalidManifestError extends Error {}

/** Each export prefix belongs to one project. Read only its newest success marker. */
export function latestManifest(
  aws: (args: string[]) => string,
  bucket: string,
  prefix: string,
  projectRef: string,
  endpointArgs: string[]
): ExportManifest | undefined {
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
  const keys = (listed.Contents ?? [])
    .map(item => item.Key)
    .filter((key): key is string => {
      if (!key?.startsWith(`${prefix}/`)) return false;
      return /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\/manifest\.json$/.test(
        key.slice(prefix.length + 1)
      );
    })
    .sort();
  const latestKey = keys.at(-1);
  if (!latestKey) return undefined;
  // Transport/auth errors must propagate separately from invalid marker contents.
  const raw = aws([
    's3',
    'cp',
    `s3://${bucket}/${latestKey}`,
    '-',
    '--only-show-errors',
    ...endpointArgs,
  ]);
  try {
    const manifest: unknown = JSON.parse(raw);
    assertManifest(manifest);
    if (manifest.projectRef !== projectRef)
      throw new Error('latest manifest belongs to another project');
    if (`${prefix}/${manifest.createdAt.replace(/[:.]/g, '-')}/manifest.json` !== latestKey)
      throw new Error('latest manifest timestamp does not match its object key');
    const stem = latestKey.slice(0, -'manifest.json'.length);
    if (
      manifest.dumpKey !== `${stem}database.dump.enc` ||
      manifest.globalsKey !== `${stem}globals.sql.enc`
    )
      throw new Error('latest manifest payload keys do not match its export directory');
    return manifest;
  } catch (error) {
    throw new InvalidManifestError(error instanceof Error ? error.message : 'invalid manifest');
  }
}
