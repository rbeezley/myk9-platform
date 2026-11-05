import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from './migrationTextScanners';
import { findViewViolations } from './viewMigrationLint';

/**
 * MYK9-1704. Guards LESSONS #replace-view-reloptions and #select-star-reexpands.
 *
 * Cutoff: 20261104185300, the newest migration on origin/main when this guard
 * landed. Migrations at or before it are grandfathered: 46 of them create views
 * and many predate security_invoker or use `alias.*`; rewriting history is not
 * the point, stopping NEW offenders is. A new migration (version > cutoff) must
 * give every CREATE [OR REPLACE] VIEW an inline `WITH (security_invoker = ...)`
 * and list its columns explicitly. Do not raise the cutoff to silence a failure.
 */
const GRANDFATHER_CUTOFF = '20261104185300';

describe('view migration lint fixtures (red/green)', () => {
  it('flags a replace without WITH (security_invoker)', () => {
    const sql = `CREATE OR REPLACE VIEW public.v AS SELECT e.id, e.name FROM entries e;`;
    expect(findViewViolations(sql).map(v => v.problem)).toEqual(['missing-security-invoker']);
  });

  it('flags plain CREATE VIEW without it, case-insensitively and across lines', () => {
    const sql = `create view\n  public.v\nas\n  select 1;`;
    expect(findViewViolations(sql).map(v => v.problem)).toEqual(['missing-security-invoker']);
  });

  it('flags alias.* and bare * in a view body', () => {
    const a = `CREATE OR REPLACE VIEW public.v WITH (security_invoker = true) AS SELECT e.*, r.x FROM entries e JOIN r ON true;`;
    const b = `CREATE VIEW public.v WITH (security_invoker = on) AS SELECT * FROM entries;`;
    expect(findViewViolations(a).map(v => v.problem)).toEqual(['select-star']);
    expect(findViewViolations(b).map(v => v.problem)).toEqual(['select-star']);
  });

  it('flags SELECT DISTINCT e.* and SELECT DISTINCT ON (x) *', () => {
    const w = 'CREATE VIEW public.v WITH (security_invoker = true) AS ';
    expect(
      findViewViolations(`${w}SELECT DISTINCT e.* FROM entries e;`).map(v => v.problem)
    ).toEqual(['select-star']);
    expect(
      findViewViolations(`${w}SELECT DISTINCT ON (e.id) * FROM entries e;`).map(v => v.problem)
    ).toEqual(['select-star']);
  });

  it('does not flag whole-row function arguments', () => {
    const w = 'CREATE VIEW public.v WITH (security_invoker = true) AS ';
    for (const expr of [
      'to_jsonb(e.*)',
      'row_to_json( t . * )',
      'json_agg(t.*)',
      'count(e.*)',
      'to_jsonb("E".*)',
    ]) {
      expect(findViewViolations(`${w}SELECT e.id, ${expr} AS j FROM entries e;`)).toEqual([]);
    }
  });

  it('flags a view created inside a DO block EXECUTE string', () => {
    const sql = `DO $$ BEGIN EXECUTE 'CREATE OR REPLACE VIEW public.v AS SELECT e.* FROM entries e'; END $$;`;
    expect(findViewViolations(sql).map(v => v.problem)).toEqual([
      'missing-security-invoker',
      'select-star',
    ]);
  });

  it('passes a compliant view', () => {
    const sql = `CREATE OR REPLACE VIEW public.v WITH (security_invoker = true) AS
      SELECT e.id, count(*) AS n FROM entries e GROUP BY e.id;`;
    expect(findViewViolations(sql)).toEqual([]);
  });

  it('ignores commented-out offenders, count(*), and star outside views', () => {
    const sql = `
      -- CREATE VIEW public.old AS SELECT e.* FROM entries e;
      /* CREATE OR REPLACE VIEW public.old2 AS SELECT * FROM x; */
      CREATE FUNCTION public.f() RETURNS int LANGUAGE sql AS $$ SELECT count(*) FROM (SELECT e.* FROM entries e) s $$;
      CREATE MATERIALIZED VIEW public.m AS SELECT count(*) AS n FROM entries;
      SELECT t.* FROM t;`;
    expect(findViewViolations(sql)).toEqual([]);
  });

  it('reads files from a temp dir (never supabase/migrations)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'viewlint-'));
    writeFileSync(
      join(dir, 'bad.sql'),
      'CREATE OR REPLACE VIEW public.v AS SELECT e.* FROM entries e;'
    );
    expect(findViewViolations(readFileSync(join(dir, 'bad.sql'), 'utf8'))).toHaveLength(2);
  });
});

describe('migrations newer than the cutoff', () => {
  it('every view carries security_invoker and selects explicit columns', () => {
    const offenders = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && f.split('_', 1)[0] > GRANDFATHER_CUTOFF)
      .flatMap(f =>
        findViewViolations(readFileSync(join(migrationsDir, f), 'utf8')).map(
          v => `${f}: view ${v.view}: ${v.problem} (${v.detail})`
        )
      );
    expect(offenders).toEqual([]);
  });

  it('cutoff is a real, existing migration version', () => {
    const versions = readdirSync(migrationsDir).map(f => f.split('_', 1)[0]);
    expect(versions).toContain(GRANDFATHER_CUTOFF);
  });
});
