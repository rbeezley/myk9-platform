export interface StoredObject {
  Key?: string;
  LastModified?: string;
}

export function retentionCandidates(objects: StoredObject[], cutoff: number): string[] {
  const groups = new Map<string, Array<{ key: string; modified: number }>>();
  for (const item of objects) {
    if (!item.Key || !item.LastModified) continue;
    const modified = Date.parse(item.LastModified);
    if (!Number.isFinite(modified)) throw new Error('invalid object modification timestamp');
    const group = item.Key.slice(0, item.Key.lastIndexOf('/'));
    const entries = groups.get(group) || [];
    entries.push({ key: item.Key, modified });
    groups.set(group, entries);
  }
  const complete = [...groups.values()]
    .filter(group =>
      ['manifest.json', 'database.dump.enc', 'globals.sql.enc'].every(name =>
        group.some(item => item.key.endsWith(`/${name}`))
      )
    )
    .sort(
      (a, b) =>
        Math.max(...b.map(item => item.modified)) - Math.max(...a.map(item => item.modified))
    );
  // An outage must not make retention delete the last complete recovery set.
  return complete
    .slice(1)
    .filter(group => group.every(item => item.modified < cutoff))
    .flatMap(group => group.map(item => item.key));
}
