/**
 * Pure scanner behind viewMigrationLint.test.ts (MYK9-1704).
 *
 * Two traps, both about views:
 *  - `CREATE OR REPLACE VIEW` resets reloptions, so a view without an inline
 *    `WITH (security_invoker = ...)` silently becomes owner-run and skips RLS.
 *  - `alias.*` / bare `*` in a view body re-expands on every rebuild and
 *    publishes whatever columns the base table gained since.
 *
 * Views inside dollar-quoted blocks (DO $$ ... EXECUTE '...' $$) are scanned
 * too: a view is a view wherever it is created, so ignoring them would leave
 * an easy bypass. MATERIALIZED views are skipped: Postgres does not accept
 * security_invoker on them.
 */

export type ViewViolation = {
  view: string;
  problem: 'missing-security-invoker' | 'select-star';
  detail: string;
};

export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const CREATE_VIEW =
  /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:GLOBAL\s+|LOCAL\s+)?(?:TEMP|TEMPORARY)\s+)?(RECURSIVE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/gi;

/** Blank out '...' string literals so a `*` or `;` inside text cannot confuse the scan. */
function blankStrings(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, m => `'${' '.repeat(m.length - 2)}'`);
}

export function findViewViolations(rawSql: string): ViewViolation[] {
  const sql = stripSqlComments(rawSql);
  const violations: ViewViolation[] = [];
  CREATE_VIEW.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CREATE_VIEW.exec(sql)) !== null) {
    const view = match[2];
    const rest = sql.slice(match.index + match[0].length);
    // Statement ends at the first `;` or closing dollar-quote outside a string literal.
    const end = blankStrings(rest).search(/;|\$[A-Za-z_]*\$/);
    const stmt = blankStrings(end === -1 ? rest : rest.slice(0, end));
    const asIdx = stmt.search(/\bAS\b(?=\s*[(\s]*(?:WITH|SELECT|VALUES|TABLE)\b)/i);
    const header = asIdx === -1 ? stmt : stmt.slice(0, asIdx);
    const body = asIdx === -1 ? '' : stmt.slice(asIdx + 2);
    if (!/\bWITH\s*\([^)]*\bsecurity_invoker\b/i.test(header)) {
      violations.push({
        view,
        problem: 'missing-security-invoker',
        detail: 'no inline WITH (security_invoker = ...)',
      });
    }
    const withoutCounts = body.replace(/\w+\s*\(\s*(?:[\w"]+\s*\.\s*)?\*\s*\)/g, ' ');
    const star =
      // DISTINCT ON keys may contain one level of nested parens: ON (lower(e.id)) *
      /(?:\b[\w"]+\.\*)|(?:\bSELECT\s+(?:DISTINCT\s+(?:ON\s*\((?:[^()]|\([^()]*\))*\)\s*)?)?\*)|(?:,\s*\*)/i.exec(
        withoutCounts
      );
    if (star) {
      violations.push({
        view,
        problem: 'select-star',
        detail: `\`${star[0].trim()}\` in the view body`,
      });
    }
  }
  return violations;
}
