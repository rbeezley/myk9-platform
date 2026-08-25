import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/20260825130000_sms_proximity_entry_index.sql'
);

describe('sms_proximity_sends entry foreign-key index contract', () => {
  it('adds one leading entry_id index without changing the idempotency primary key', () => {
    expect(existsSync(migrationPath), 'The additive entry index migration must exist').toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(
      /create\s+index\s+sms_proximity_sends_entry_id_idx\s+on\s+public\.sms_proximity_sends\s*\(\s*entry_id\s*\)/i
    );
    expect(sql).not.toMatch(/drop\s+(?:constraint|index)/i);
    expect(sql).not.toMatch(/alter\s+table[^;]*primary\s+key/i);
  });
});
