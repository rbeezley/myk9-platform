/**
 * MYK9-1071: the queued (offline) person save may only send columns the
 * database's own save path accepts. `update_person_details` holds the editors'
 * whitelist (`v_editable`); `update_person_details_versioned` wraps it and also
 * refuses email. This pins PERSON_QUEUED_UPDATE_COLUMNS against the whitelist in
 * the LATEST migration that defines the function, so a whitelist change in SQL
 * cannot silently leave the client sending a refused column.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PEOPLE_MAPPER_COLUMNS,
  PEOPLE_REPLICA_COLUMNS,
  PERSON_QUEUED_UPDATE_COLUMNS,
} from './peopleColumns';

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../../../../../supabase/migrations');
const DEFINES = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.update_person_details\s*\(/i;

function latestDefinition(): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();
  let latest: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    const match = DEFINES.exec(sql);
    if (match) latest = { file, body: sql.slice(match.index) };
  }
  if (!latest) throw new Error('no migration defines public.update_person_details');
  return latest;
}

function editableWhitelist(body: string): string[] {
  const match = /v_editable\s+text\[\]\s*:=\s*ARRAY\[([^\]]*)\]/i.exec(body);
  if (!match) throw new Error('update_person_details has no v_editable whitelist');
  return [...match[1]!.matchAll(/'([a-z_]+)'/g)].map(m => m[1]!);
}

describe('PERSON_QUEUED_UPDATE_COLUMNS (MYK9-1071)', () => {
  const { file, body } = latestDefinition();
  const whitelist = editableWhitelist(body);

  it('reads a real whitelist from the latest definition', () => {
    expect(file).toMatch(/^\d{14}_/);
    expect(whitelist).toContain('first_name');
    expect(whitelist.length).toBeGreaterThan(5);
  });

  it('is a subset of the database whitelist', () => {
    const outside = PERSON_QUEUED_UPDATE_COLUMNS.filter(column => !whitelist.includes(column));
    expect(outside, `not accepted by ${file}`).toEqual([]);
  });

  it('never carries email (decision D2: email changes are online only)', () => {
    expect(PERSON_QUEUED_UPDATE_COLUMNS).not.toContain('email');
  });

  it('downloads exactly the mapper columns plus the OCC version', () => {
    expect(PEOPLE_REPLICA_COLUMNS).toBe(`${PEOPLE_MAPPER_COLUMNS}, version`);
  });
});
