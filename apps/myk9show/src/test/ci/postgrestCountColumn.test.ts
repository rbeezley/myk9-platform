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

type Consts = Map<string, ts.Node>;

/** Same-file `const x = <init>` and `function x() {}` declarations, by name. */
function collectDeclarations(sf: ts.SourceFile): Consts {
  const map: Consts = new Map();
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      map.set(node.name.text, node.initializer);
    } else if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      map.set(node.name.text, node.body);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return map;
}

const unwrap = (node: ts.Node): ts.Node => {
  let n = node;
  while (
    ts.isParenthesizedExpression(n) ||
    ts.isAsExpression(n) ||
    ts.isSatisfiesExpression(n) ||
    ts.isNonNullExpression(n)
  ) {
    n = n.expression;
  }
  return n;
};

/** Follows identifiers to their same-file initializer (bounded, cycle-safe). */
function resolveConst(node: ts.Node | undefined, decls: Consts): ts.Node | undefined {
  let n = node && unwrap(node);
  for (let hops = 0; n && ts.isIdentifier(n) && hops < 8; hops++) {
    const next = decls.get(n.text);
    n = next && unwrap(next);
  }
  return n;
}

const stringLiteral = (node: ts.Node | undefined, decls: Consts): string | undefined => {
  const n = resolveConst(node, decls);
  return n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined;
};

const hasStarColumn = (columns: string): boolean =>
  columns
    .split(',')
    .map(c => c.trim())
    .some(c => c === '*');

/** true / false when the options arg is resolvable; undefined when it is not. */
function hasCountOption(node: ts.Node | undefined, decls: Consts, depth = 0): boolean | undefined {
  const n = resolveConst(node, decls);
  if (!n || depth > 8 || !ts.isObjectLiteralExpression(n)) return undefined;
  for (const p of n.properties) {
    if (ts.isSpreadAssignment(p)) {
      const inner = hasCountOption(p.expression, decls, depth + 1);
      if (inner === undefined) return undefined;
      if (inner) return true;
    } else if (
      (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === 'count'
    ) {
      return true;
    }
  }
  return false;
}

/** The declared table-name wrappers: `untypedFrom('<t>')` is defined in this file. */
const TABLE_NAME_WRAPPERS: Record<string, string> = {
  untypedFrom: 'apps/myk9show/src/services/database/_shared/untyped-from.ts',
};

/** `.from('<t>')` or `untypedFrom('<t>')`. */
function tableFromCall(call: ts.CallExpression, decls: Consts): string | undefined {
  const callee = call.expression;
  const isFrom =
    (ts.isPropertyAccessExpression(callee) && callee.name.text === 'from') ||
    (ts.isIdentifier(callee) && callee.text in TABLE_NAME_WRAPPERS);
  return isFrom ? stringLiteral(call.arguments[0], decls) : undefined;
}

/** A zero-arg same-file helper (`const t = () => untypedFrom('x')`) resolved to its table. */
function tableFromHelper(name: string, decls: Consts): string | undefined {
  const body = decls.get(name);
  if (!body) return undefined;
  let found: string | undefined;
  const visit = (node: ts.Node) => {
    if (found !== undefined) return;
    if (ts.isCallExpression(node)) found = tableFromCall(node, decls);
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

/** Walks down the receiver chain of `.select(...)` looking for the table. */
function findFromTable(callee: ts.Expression, decls: Consts): string | undefined {
  let node: ts.Expression = callee;
  for (;;) {
    if (ts.isPropertyAccessExpression(node)) node = node.expression;
    else if (ts.isCallExpression(node)) {
      const direct = tableFromCall(node, decls);
      if (direct !== undefined) return direct;
      if (ts.isIdentifier(node.expression) && node.arguments.length === 0) {
        const viaHelper = tableFromHelper(node.expression.text, decls);
        if (viaHelper !== undefined) return viaHelper;
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
  const decls = collectDeclarations(sf);
  const found: Offender[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'select' &&
      node.arguments.length >= 2
    ) {
      const columns = stringLiteral(node.arguments[0], decls);
      // An options arg we cannot resolve on a `*` select is unverifiable: fail it.
      const counts = hasCountOption(node.arguments[1], decls) !== false;
      const table = findFromTable(node.expression.expression, decls);
      if (
        counts &&
        columns !== undefined &&
        hasStarColumn(columns) &&
        table &&
        tables.includes(table)
      ) {
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

    it('is red when the options arrive through a same-file const', () => {
      const src = `const HEAD_COUNT = { count: 'exact' as const, head: true };\nsupabase.from('entries').select('*', HEAD_COUNT);`;
      expect(findCountStarOffenders(src)).toEqual([{ table: 'entries', line: 2 }]);
    });

    it('is red when the column list arrives through a "*" const', () => {
      const src = `const COUNT_COLUMN = '*';\nsupabase.from('entries').select(COUNT_COLUMN, { count: 'exact', head: true });`;
      expect(findCountStarOffenders(src)).toEqual([{ table: 'entries', line: 2 }]);
    });

    it('is red when options are spread from a const', () => {
      const src = `const BASE = { count: 'exact' };\nsupabase.from('entries').select('*', { ...BASE, head: true });`;
      expect(findCountStarOffenders(src)).toHaveLength(1);
    });

    it('is red when a "*" select has options that cannot be resolved', () => {
      const src = `import { OPTS } from './o';\nsupabase.from('entries').select('*', OPTS);`;
      expect(findCountStarOffenders(src)).toHaveLength(1);
    });

    it('is green when a const resolves to a named column or no count', () => {
      const src = `const COUNT_COLUMN = 'id';\nconst HEAD = { head: true };\nconst C = { count: 'exact' };\nsupabase.from('entries').select(COUNT_COLUMN, C);\nsupabase.from('entries').select('*', HEAD);`;
      expect(findCountStarOffenders(src)).toEqual([]);
    });

    it('is red through untypedFrom(...)', () => {
      const src = `untypedFrom('judge_assignments').select('*', { count: 'exact', head: true });`;
      expect(findCountStarOffenders(src)).toEqual([{ table: 'judge_assignments', line: 1 }]);
    });

    it('is red through a zero-arg same-file table helper', () => {
      const src = `const assignmentsTable = () => untypedFrom('judge_assignments');\nassignmentsTable().select('*', { count: 'exact' }).eq('a', 1);`;
      expect(findCountStarOffenders(src)).toEqual([{ table: 'judge_assignments', line: 2 }]);
    });

    it('is green through a helper for a non-allowlisted table', () => {
      const src = `const t = () => untypedFrom('judge_certifications');\nt().select('*', { count: 'exact' });`;
      expect(findCountStarOffenders(src)).toEqual([]);
    });

    it('declares only wrappers that exist', () => {
      for (const [name, path] of Object.entries(TABLE_NAME_WRAPPERS)) {
        expect(readFileSync(join(REPO_ROOT, path), 'utf8')).toMatch(
          new RegExp(`export (const|function) ${name}\\b`)
        );
      }
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
