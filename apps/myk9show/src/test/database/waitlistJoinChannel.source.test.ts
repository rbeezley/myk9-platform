import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/20260622002405_waitlist_join_channel.sql'),
  'utf8'
);

const waitlistReads = readFileSync(
  resolve(__dirname, '../../services/database/waitlists/reads.ts'),
  'utf8'
);

describe('waitlist joined_via channel contract', () => {
  it('adds a constrained channel column for online vs mail-in waitlist rows', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS joined_via');
    expect(migration).toContain("CHECK (joined_via IN ('online', 'mail_in'))");
  });

  it('marks exhibitor-facing waitlist joins as online', () => {
    expect(waitlistReads).toContain("joined_via: 'online'");
    expect(migration).toContain('joined_via');
    expect(migration).toContain("'online'");
  });
});
