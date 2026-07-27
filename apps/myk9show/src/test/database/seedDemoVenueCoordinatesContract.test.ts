import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');

describe('seed-demo venue coordinate contract', () => {
  it('keeps the Heartland show pin in Tulsa with its displayed address', () => {
    const seed = readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');
    const heartlandInsert = seed.slice(
      seed.indexOf('INSERT INTO public.shows'),
      seed.indexOf('-- Visibility settings')
    );

    expect(heartlandInsert).toContain(
      'location, city, state, latitude, longitude, status, club_id,'
    );
    expect(heartlandInsert).toMatch(
      /'100 Dog Show Lane, Tulsa, OK 74101',\s*'Tulsa', 'Oklahoma',\s*36\.15, -95\.99,\s*'published'/
    );
  });
});
