// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Guard for LESSON postgrest-count-column (MYK9-1705, split from MYK9-1654).
 *
 * `.from('entries').select('*', { count: 'exact', head: true })` returns 403
 * with an empty body: the table has no table-level SELECT, so `*` asks for
 * columns the role cannot read. Name a column instead: `select('id', ...)`.
 *
 * Scope: only chains where `.from('<table>')` and `.select(...)` sit in the
 * same call chain are seen. A builder held in a variable and selected later is
 * out of scope for this check.
 */

const REPO_ROOT = resolve(__dirname, '../../../../..');

/**
 * Declared list of column-allowlisted tables. The migrations cross-check below
 * fails when a migration column-grants SELECT on a table missing from here, so
 * a new allowlisted table cannot be added silently.
 */
export const COLUMN_ALLOWLISTED_TABLES: readonly string[] = [
  'classes',
  'dogs',
  'entries',
  'judge_assignments',
  'people',
  'platform_settings',
];

/** Tables whose column-level SELECT grants are in migrations. */
export function tablesWithColumnSelectGrants(migrationsDir: string): string[] {
  const tables = new Set<string>();
  const re =
    /GRANT\s+SELECT\s*\([^)]*\)\s*ON\s+(?:TABLE\s+)?(?:public\.)?"?([a-z_]+)"?\s+TO\s+[a-z_, ]+/gi;
  for (const file of readdirSync(migrationsDir).filter(f => f.endsWith('.sql'))) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    for (const m of sql.matchAll(re)) tables.add(m[1].toLowerCase());
  }
  return [...tables].sort();
}

interface Offender {
  table: string;
  line: number;
}

const stringLiteral = (node: ts.Node | undefined): string | undefined =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;

const hasStarColumn = (columns: string): boolean =>
  columns
    .split(',')
    .map(c => c.trim())
    .some(c => c === '*');

const hasCountOption = (node: ts.Node | undefined): boolean =>
  !!node &&
  ts.isObjectLiteralExpression(node) &&
  node.properties.some(
    p =>
      (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === 'count'
  );

/** Walks down the receiver chain of `.select(...)` looking for `.from('<table>')`. */
function findFromTable(callee: ts.Expression): string | undefined {
  let node: ts.Expression = callee;
  for (;;) {
    if (ts.isPropertyAccessExpression(node)) node = node.expression;
    else if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'from') {
        return stringLiteral(node.arguments[0]);
      }
      node = node.expression;
    } else if (ts.isNonNullExpression(node) || ts.isParenthesizedExpression(node)) {
      node = node.expression;
    } else return undefined;
  }
}

export function findCountStarOffenders(
  source: string,
  tables: readonly string[] = COLUMN_ALLOWLISTED_TABLES
): Offender[] {
  const sf = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Offender[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'select' &&
      hasCountOption(node.arguments[1])
    ) {
      const columns = stringLiteral(node.arguments[0]);
      const table = findFromTable(node.expression.expression);
      if (columns !== undefined && hasStarColumn(columns) && table && tables.includes(table)) {
        found.push({
          table,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'test' || name === 'tests') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listSourceFiles(full, out);
    else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec)\.(ts|tsx)$/.test(name) &&
      !name.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('PostgREST count names a column on column-allowlisted tables', () => {
  it('the declared allowlist matches the tables that migrations column-grant SELECT on', () => {
    const fromMigrations = tablesWithColumnSelectGrants(join(REPO_ROOT, 'supabase/migrations'));
    expect(fromMigrations.length).toBeGreaterThan(0);
    expect([...COLUMN_ALLOWLISTED_TABLES].sort()).toEqual(fromMigrations);
  });

  describe('fixtures', () => {
    it('is red on select("*", { count }) for an allowlisted table', () => {
      const src = `await supabase.from('entries').select('*', { count: 'exact', head: true }).eq('a', 1);`;
      expect(findCountStarOffenders(src)).toEqual([{ table: 'entries', line: 1 }]);
    });

    it('is red when the chain is multi-line and `*` has company', () => {
      const src = `const r = await client\n  .from('people')\n  .eq('x', 1)\n  .select('id, *', { count: 'exact' });`;
      expect(findCountStarOffenders(src)).toEqual([{ table: 'people', line: 1 }]);
    });

    it('is green when a column is named', () => {
      const src = `supabase.from('entries').select('id', { count: 'exact', head: true });`;
      expect(findCountStarOffenders(src)).toEqual([]);
    });

    it('is green for a star select without count', () => {
      const src = `supabase.from('entries').select('*');`;
      expect(findCountStarOffenders(src)).toEqual([]);
    });

    it('is green for a table that has table-level SELECT', () => {
      const src = `supabase.from('shows').select('*', { count: 'exact', head: true });`;
      expect(findCountStarOffenders(src)).toEqual([]);
    });
  });

  it('no source file counts with select("*") on an allowlisted table', () => {
    const roots = [join(REPO_ROOT, 'apps/myk9show/src')];
    for (const pkg of readdirSync(join(REPO_ROOT, 'packages'))) {
      roots.push(join(REPO_ROOT, 'packages', pkg, 'src'));
    }
    const files = roots.flatMap(r => listSourceFiles(r));
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.flatMap(file =>
      findCountStarOffenders(readFileSync(file, 'utf8')).map(
        o => `${relative(REPO_ROOT, file)}:${o.line} (${o.table})`
      )
    );
    expect(offenders).toEqual([]);
  });
});
