import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/20260907150000_add_missing_fk_leading_indexes.sql'
);

const expectedIndexes = [
  {
    name: 'calendar_feed_tokens_show_id_fk_idx',
    table: 'public.calendar_feed_tokens',
    columns: 'show_id',
  },
  {
    name: 'show_officials_person_id_fk_idx',
    table: 'public.show_officials',
    columns: 'person_id',
  },
  {
    name: 'show_officials_created_by_fk_idx',
    table: 'public.show_officials',
    columns: 'created_by',
  },
];

function readMigration(): string {
  expect(existsSync(migrationPath), 'The additive FK-index migration must exist').toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

function parseCreateIndexes(sql: string) {
  const sqlWithoutComments = sql
    .replace(/--[^\n]*(?:\n|$)/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

  return [
    ...sqlWithoutComments.matchAll(
      /create\s+(?<unique>unique\s+)?index\s+(?:(?<concurrent>concurrently)\s+)?(?:(?<ifNotExists>if\s+not\s+exists)\s+)?(?<name>[a-z_][a-z0-9_$]*)\s+on\s+(?<table>(?:[a-z_][a-z0-9_$]*\.)?[a-z_][a-z0-9_$]*)(?:\s+using\s+(?<method>[a-z_][a-z0-9_$]*))?\s*\((?<columns>[^)]*)\)\s*;/gi
    ),
  ].map(({ groups }) => ({
    name: groups!.name.toLowerCase(),
    table: groups!.table.toLowerCase(),
    columns: groups!.columns.replace(/\s+/g, ' ').trim().toLowerCase(),
    isUnique: Boolean(groups!.unique),
    isConcurrent: Boolean(groups!.concurrent),
    usesIfNotExists: Boolean(groups!.ifNotExists),
    method: groups!.method?.toLowerCase() ?? null,
  }));
}

describe('MYK9-439 missing FK-leading indexes', () => {
  it('adds exactly the three requested leading-column indexes', () => {
    const sql = readMigration();
    const createdIndexes = parseCreateIndexes(sql);
    const createIndexStatements = [
      ...sql
        .replace(/--[^\n]*(?:\n|$)/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .matchAll(/\bcreate\s+(?:unique\s+)?index\b/gi),
    ];

    expect(createdIndexes).toHaveLength(createIndexStatements.length);
    expect(createdIndexes.map(({ name, table, columns }) => ({ name, table, columns }))).toEqual(
      expectedIndexes
    );
    expect(createdIndexes.every(index => !index.isUnique && !index.isConcurrent)).toBe(true);
  });

  it('is additive and proves strict catalog coverage for each target FK', () => {
    const sql = readMigration();
    const catalogSql = sql.toLowerCase();
    const normalizedCatalogSql = catalogSql.replace(/\s+/g, ' ');

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

    const fkGuard = 'if target_fk_count <> 3 or target_fk_pair_count <> 3 then';
    const indexCheck = 'and not exists ( select 1 from pg_index';
    expect(normalizedCatalogSql).toContain(fkGuard);
    expect(normalizedCatalogSql.indexOf(fkGuard)).toBeLessThan(
      normalizedCatalogSql.indexOf(indexCheck)
    );
    expect(normalizedCatalogSql).toContain("count(distinct format('%i.%i', t.relname, a.attname))");
    expect(normalizedCatalogSql).toContain('cardinality(c.conkey) = 1');
    expect(normalizedCatalogSql).toContain("n.nspname = 'public'");
    expect(normalizedCatalogSql).toContain("t.relname = 'calendar_feed_tokens'");
    expect(normalizedCatalogSql).toContain("a.attname = 'show_id'");
    expect(normalizedCatalogSql).toContain("t.relname = 'show_officials'");
    expect(normalizedCatalogSql).toContain("a.attname = 'person_id'");
    expect(normalizedCatalogSql).toContain("a.attname = 'created_by'");
  });
});
