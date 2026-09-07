import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/20260907150000_add_missing_fk_leading_indexes.sql'
);

const expectedIndexes = [
  'calendar_feed_tokens_show_id_fk_idx on public.calendar_feed_tokens (show_id)',
  'show_officials_person_id_fk_idx on public.show_officials (person_id)',
  'show_officials_created_by_fk_idx on public.show_officials (created_by)',
];

describe('MYK9-439 missing FK-leading indexes', () => {
  it('adds exactly the three requested leading-column indexes', () => {
    expect(existsSync(migrationPath), 'The additive FK-index migration must exist').toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    const createdIndexes = [
      ...sql.matchAll(
        /create\s+index\s+([a-z0-9_]+)\s+on\s+public\.([a-z0-9_]+)\s*\(\s*([a-z0-9_]+)\s*\)/gi
      ),
    ].map(([, name, table, column]) => `${name} on public.${table} (${column})`);

    expect(createdIndexes).toEqual(expectedIndexes);
  });

  it('is additive and proves strict catalog coverage for each target FK', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const catalogSql = sql.toLowerCase();

    expect(sql).toContain('begin;');
    expect(sql.trimEnd()).toMatch(/commit;$/i);
    expect(sql).not.toMatch(/drop\s+(?:constraint|index)/i);
    expect(sql).not.toMatch(/alter\s+table[^;]*primary\s+key/i);
    expect(catalogSql).toContain('pg_constraint');
    expect(catalogSql).toContain('pg_index');
    expect(catalogSql).toContain('i.indisvalid');
    expect(catalogSql).toContain('i.indisready');
    expect(catalogSql).toContain('i.indpred is null');
    expect(catalogSql).toContain('raise exception');
  });
});
