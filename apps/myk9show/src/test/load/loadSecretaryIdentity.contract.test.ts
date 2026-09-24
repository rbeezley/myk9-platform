import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(process.cwd(), '../..');
const setup = readFileSync(
  resolve(repoRoot, 'apps/myk9show/scripts/setup-e2e-test-users.ts'),
  'utf8'
);
const seed = readFileSync(resolve(repoRoot, 'supabase/seed-demo.sql'), 'utf8');
const loadFixtureSeed = readFileSync(resolve(repoRoot, 'supabase/seed-load-fixture.sql'), 'utf8');

function extractSetupUserBlock(email: string): string {
  const emailIndex = setup.indexOf(`email: '${email}'`);
  expect(emailIndex, `${email} is missing from setup-e2e-test-users.ts`).toBeGreaterThan(-1);
  const blockStart = setup.lastIndexOf('{', emailIndex);
  const blockEnd = setup.indexOf('},', emailIndex);
  expect(blockStart).toBeGreaterThan(-1);
  expect(blockEnd).toBeGreaterThan(blockStart);
  return setup.slice(blockStart, blockEnd);
}

function extractSeedNameUpdate(): string {
  const updateStart = seed.indexOf('-- The load-secretary accounts are optional');
  const updateEnd = seed.indexOf(';', updateStart) + 1;
  expect(updateStart).toBeGreaterThan(-1);
  expect(updateEnd).toBeGreaterThan(updateStart);
  return seed.slice(updateStart, updateEnd);
}

function readSeedNameAssignments(update: string) {
  const assignments = new Map<string, { firstName: string; lastName: string }>();
  for (const match of update.matchAll(
    /\(\s*'([^']+@myk9t\.com)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g
  )) {
    const email = match[1];
    const firstName = match[2];
    const lastName = match[3];
    if (email && firstName && lastName) {
      assignments.set(email, { firstName, lastName });
    }
  }
  return assignments;
}

const loadSecretaries = [
  { email: 'load-secretary-1@myk9t.com', firstName: 'Renee', lastName: 'Lawson' },
  { email: 'load-secretary-2@myk9t.com', firstName: 'Tanya', lastName: 'Ortiz' },
  { email: 'load-secretary-3@myk9t.com', firstName: 'Caleb', lastName: 'Morgan' },
] as const;

describe('load-secretary fixture identity', () => {
  it('binds each plausible name pair to its stable email in setup and seed', () => {
    const names = loadSecretaries.map(({ firstName, lastName }) => `${firstName} ${lastName}`);
    const seedAssignments = readSeedNameAssignments(extractSeedNameUpdate());

    expect(new Set(names).size).toBe(loadSecretaries.length);
    for (const secretary of loadSecretaries) {
      const setupBlock = extractSetupUserBlock(secretary.email);
      expect(setupBlock).toContain(`email: '${secretary.email}'`);
      expect(setupBlock).toContain(`firstName: '${secretary.firstName}'`);
      expect(setupBlock).toContain(`lastName: '${secretary.lastName}'`);
      expect(seedAssignments.get(secretary.email)).toEqual({
        firstName: secretary.firstName,
        lastName: secretary.lastName,
      });
    }
    expect(seedAssignments.size).toBe(loadSecretaries.length);
    const seedUpdate = extractSeedNameUpdate();
    expect(seedUpdate).toContain('UPDATE public.people AS p');
    expect(seedUpdate).toContain('lower(p.email) = names.email');
    expect(seedUpdate).toContain('IS DISTINCT FROM');
    expect(seedUpdate).not.toContain('RAISE EXCEPTION');
  });

  it('rejects the old split first and last fields in canonical fixture sources', () => {
    const canonicalSources = `${setup}\n${seed}\n${loadFixtureSeed}`;
    const firstNameField = ['first', 'Name'].join('');
    const lastNameField = ['last', 'Name'].join('');

    for (const ordinal of ['One', 'Two', 'Three']) {
      expect(canonicalSources).not.toContain(`${firstNameField}: 'Load'`);
      expect(canonicalSources).not.toContain(`${lastNameField}: 'Secretary ${ordinal}'`);
      expect(canonicalSources).not.toContain(`Load Secretary ${ordinal}`);
    }
  });
});
