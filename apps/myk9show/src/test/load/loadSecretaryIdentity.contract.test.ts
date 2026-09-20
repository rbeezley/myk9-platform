import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(process.cwd(), '../..');
const setup = readFileSync(
  resolve(repoRoot, 'apps/myk9show/scripts/setup-e2e-test-users.ts'),
  'utf8'
);
const seed = readFileSync(resolve(repoRoot, 'supabase/seed-demo.sql'), 'utf8');

const loadSecretaries = [
  { email: 'load-secretary-1@myk9t.com', firstName: 'Renee', lastName: 'Lawson' },
  { email: 'load-secretary-2@myk9t.com', firstName: 'Tanya', lastName: 'Ortiz' },
  { email: 'load-secretary-3@myk9t.com', firstName: 'Caleb', lastName: 'Morgan' },
] as const;

describe('load-secretary fixture identity', () => {
  it('keeps stable emails while using three distinct plausible names', () => {
    const names = loadSecretaries.map(({ firstName, lastName }) => `${firstName} ${lastName}`);

    expect(new Set(names).size).toBe(loadSecretaries.length);
    for (const secretary of loadSecretaries) {
      expect(setup).toContain(`email: '${secretary.email}'`);
      expect(setup).toContain(`firstName: '${secretary.firstName}'`);
      expect(setup).toContain(`lastName: '${secretary.lastName}'`);
    }
  });

  it('does not reintroduce the old rendered names in canonical fixture sources', () => {
    const canonicalSources = `${setup}\n${seed}`;

    for (const ordinal of ['One', 'Two', 'Three']) {
      expect(canonicalSources).not.toContain(`Load Secretary ${ordinal}`);
    }
  });
});
