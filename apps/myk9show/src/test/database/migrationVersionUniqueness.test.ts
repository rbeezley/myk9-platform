import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migrationsDir = resolve(repoRoot, 'supabase/migrations');

describe('migration version lineage', () => {
  it('keeps every Supabase migration version unique', () => {
    const filesByVersion = new Map<string, string[]>();

    for (const file of readdirSync(migrationsDir).filter(name => name.endsWith('.sql'))) {
      const version = file.split('_', 1)[0];
      filesByVersion.set(version, [...(filesByVersion.get(version) ?? []), file]);
    }

    const collisions = [...filesByVersion.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([version, files]) => ({ version, files: files.sort() }));

    expect(collisions).toEqual([]);
  });
});
