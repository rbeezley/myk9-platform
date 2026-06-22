import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/20260622002752_class_overflow_policy.sql'),
  'utf8'
);

describe('class overflow policy migration', () => {
  it('adds the waitlist-vs-deny class overflow policy with waitlist as the default', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS overflow_policy');
    expect(migration).toContain("DEFAULT 'waitlist'");
    expect(migration).toContain("CHECK (overflow_policy IN ('waitlist', 'deny'))");
  });
});
