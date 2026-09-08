export interface StoredObject {
  Key?: string;
  LastModified?: string;
}

const REQUIRED_ARTIFACTS = ['manifest.json', 'database.dump.enc', 'globals.sql.enc'] as const;
const KNOWN_ARTIFACTS = new Set<string>(REQUIRED_ARTIFACTS);

export function retentionCandidates(
  objects: StoredObject[],
  cutoff: number,
  snapshotTimes: ReadonlyMap<string, number>
): string[] {
  const groups = new Map<string, Array<{ key: string; modified: number }>>();
  for (const item of objects) {
    if (!item.Key || !item.LastModified) throw new Error('incomplete object metadata');
    const modified = Date.parse(item.LastModified);
    if (!Number.isFinite(modified)) throw new Error('invalid object modification timestamp');
    const group = item.Key.slice(0, item.Key.lastIndexOf('/'));
    const entries = groups.get(group) || [];
    entries.push({ key: item.Key, modified });
    groups.set(group, entries);
  }
  const complete = [...groups.values()]
    .filter(group =>
      REQUIRED_ARTIFACTS.every(name => group.some(item => basename(item.key) === name))
    )
    .map(group => {
      const stem = group[0].key.slice(0, group[0].key.lastIndexOf('/'));
      const createdAt = snapshotTimes.get(stem);
      if (createdAt === undefined || !Number.isFinite(createdAt))
        throw new Error('complete backup lacks a validated snapshot timestamp');
      return { group, createdAt };
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(item => item.group);
  // An outage must not make retention delete the last complete recovery set.
  const newestComplete =
    complete[0] ??
    [...groups.values()].sort(
      (a, b) =>
        Math.max(...b.map(item => item.modified)) - Math.max(...a.map(item => item.modified))
    )[0];
  return (
    [...groups.values()]
      .filter(group => group !== newestComplete)
      // A group with an unfamiliar object is outside this export contract; preserve it
      // for operator inspection rather than deleting data we cannot identify.
      .filter(group => group.every(item => KNOWN_ARTIFACTS.has(basename(item.key))))
      .filter(group => group.every(item => item.modified < cutoff))
      .flatMap(group =>
        [
          ...group.filter(item => basename(item.key) === 'manifest.json'),
          ...group.filter(item => basename(item.key) !== 'manifest.json'),
        ].map(item => item.key)
      )
  );
}

function basename(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1);
}
