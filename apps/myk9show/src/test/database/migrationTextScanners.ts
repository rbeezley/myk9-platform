import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Migration-text scanners shared by nullClubShowAuthorizationContract.test.ts.
 *
 * Extracted from that file by MYK9-585 purely to keep it under the 500-line
 * ceiling once the guard assertions landed. Nothing here changed in the move;
 * each function's own header explains the traps it exists to dodge.
 */

export const migrationsDir = resolve(process.cwd(), '../../supabase/migrations');

/** Every `is_club_admin(x)` / `is_trial_secretary(x)` call with an argument. */
export const CLUB_HELPER_CALL = /(is_club_admin|is_trial_secretary)\s*\(\s*([^)\s]+)\s*\)/g;

/**
 * Latest definition wins: several migrations replace these functions, and only
 * the last one to touch a given function describes live behaviour.
 */
export function latestDefinitions(): Map<string, { file: string; body: string }> {
  const files = readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort();
  const latest = new Map<string, { file: string; body: string }>();

  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
    // Every declaration form in this migration set: 52 omit the `public.`
    // schema prefix and 12 use CREATE FUNCTION without OR REPLACE. Requiring
    // both made can_manage_show and can_manage_trial invisible to this check —
    // exactly the blind spot it exists to close.
    const pattern = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sql)) !== null) {
      const name = match[1];
      const start = match.index;
      pattern.lastIndex = match.index + match[0].length;

      // Terminate at the function's own dollar-quoted body, NOT at the next
      // function declaration. Running to the next declaration swept in whatever
      // followed — on the first run this attributed a trailing
      // `entry_status_history_select` POLICY to record_entry_status_history,
      // which calls no helper at all.
      const rest = sql.slice(pattern.lastIndex);
      const tagMatch = /AS\s+(\$[a-zA-Z_]*\$)/.exec(rest);
      let end: number;
      if (tagMatch) {
        const tag = tagMatch[1];
        const bodyStart = pattern.lastIndex + tagMatch.index + tagMatch[0].length;
        const closing = sql.indexOf(tag, bodyStart);
        end = closing === -1 ? sql.length : closing + tag.length;
      } else {
        const nextIndex = rest.search(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s/i);
        end = nextIndex === -1 ? sql.length : pattern.lastIndex + nextIndex;
      }
      latest.set(name, { file, body: sql.slice(start, end) });
    }
  }
  return latest;
}

/**
 * MYK9-571 round 2 (P1-A/R2): the same trap in RLS-policy form. Round 1 of
 * the 20260915231500 migration dropped and recreated role_requests_select
 * with a third arm, `requested_role = 'secretary' AND is_club_admin(club_id)`
 * — club_id is nullable (insert_signup_role_requests never sets it), and
 * is_club_admin(NULL) answers "club admin anywhere?", so every club admin,
 * anywhere, could read every signup-generated secretary request. Round 2
 * removed the arm rather than guard it inline; this scanner is what stops a
 * future PR from re-adding an unguarded one on ANY policy, not just this
 * table's.
 */

/**
 * Every LIVE policy statement, latest wins: `CREATE`/`ALTER POLICY` (re)sets
 * a policy's tracked body, `DROP POLICY` (this codebase's own
 * drop-and-recreate convention — Postgres has no `CREATE OR REPLACE POLICY`)
 * removes it until a later `CREATE`/`ALTER` brings it back.
 *
 * MYK9-585 fixed two blind spots the first cut of this scanner had:
 *
 *   1. It matched ONLY quoted policy names (`"name"`). Most of this
 *      codebase's policies are declared unquoted (`create policy shows_select
 *      on public.shows ...`) — 74 of this migration set's LIVE policies, by
 *      count. A quoted `DROP POLICY "name"` followed by an unquoted
 *      `CREATE POLICY name` evicted the policy from the map entirely (the
 *      unquoted CREATE was invisible), and an unquoted `CREATE POLICY
 *      role_requests_select ... OR (select is_club_admin(club_id))` would
 *      have passed this scanner GREEN. Both forms are matched now.
 *
 *   2. It never recognised `ALTER POLICY`, which
 *      20260727130000_rls_initplan_wrap_auth_calls.sql uses (deliberately,
 *      per that file's own header, to avoid a drop-then-recreate window) to
 *      rewrite 71 policies' USING/WITH CHECK clauses. Untracked, the map
 *      held each of those policies' body from its ORIGINAL CREATE — stale
 *      text for the "what does this predicate say today" question the
 *      scanner exists to answer, even though that particular migration
 *      happens not to touch any is_club_admin/is_trial_secretary(club_id)
 *      call (its own header says so: column-argument helper calls are left
 *      exactly as-is). `ALTER POLICY ... USING (...) [WITH CHECK (...)]`
 *      fully REPLACES the previous predicate (Postgres semantics, not a
 *      merge), so it is tracked the same way CREATE is: the new span
 *      overwrites the map entry.
 *
 * Keyed on (table, name) — not name alone — so an ALTER or DROP naming a
 * policy on one table cannot evict or overwrite a same-named policy on a
 * different one; the two forms (quoted/bare) are normalised to lower case
 * for the key, matching Postgres's own case-insensitive unquoted-identifier
 * rule.
 */
/**
 * Strips `--` line comments and block comments before scanning. Without
 * this, a prose comment like "(rolled-back ALTER POLICY experiment on the
 * live Micro project)" (20260730170000_hashable_entries_manager_policy.sql)
 * parses as a real ALTER POLICY statement -- a false policy named
 * "experiment" on a table named "the". A real SQL parser would never see
 * it; this scanner is a regex, so it strips comments first instead of
 * pretending prose cannot look like DDL.
 */
function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

export function latestPolicyDefinitions(): Map<
  string,
  { file: string; body: string; name: string }
> {
  const files = readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort();
  const latest = new Map<string, { file: string; body: string; name: string }>();

  const eventPattern =
    /\b(CREATE|ALTER|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))\s+ON\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)/gi;

  for (const file of files) {
    const sql = stripSqlComments(readFileSync(resolve(migrationsDir, file), 'utf8'));
    eventPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = eventPattern.exec(sql)) !== null) {
      const keyword = match[1]!.toUpperCase();
      const name = (match[2] ?? match[3])!;
      const table = match[4]!;
      const key = `${table.toLowerCase()}::${name.toLowerCase()}`;

      if (keyword === 'DROP') {
        latest.delete(key);
        continue;
      }

      const start = match.index;
      // Policy bodies are not dollar-quoted, so the statement's own terminating
      // `;` is a safe boundary (unlike the function scanner above, which must
      // dodge dollar-quoted bodies that can themselves contain semicolons).
      const terminator = sql.indexOf(';', eventPattern.lastIndex);
      const end = terminator === -1 ? sql.length : terminator + 1;
      // CREATE and ALTER both fully (re)set the tracked body — Postgres's
      // ALTER POLICY USING/WITH CHECK REPLACES the predicate, it does not
      // merge into it.
      latest.set(key, { file, body: sql.slice(start, end), name });
      eventPattern.lastIndex = end;
    }
  }
  return latest;
}

/**
 * MYK9-329: the owner-run view had the same collapse in prose form. Its
 * `can_manage` flag carried `(sh.club_id IS NULL AND ctx.has_manager_role)`,
 * which no `is_club_admin(x)` scan can see because it never calls the helper.
 * Only the LATEST migration that defines the view describes live behaviour.
 */
export function latestViewDefinition(viewName: string): { file: string; body: string } {
  const marker = `CREATE OR REPLACE VIEW public.${viewName}`;
  const files = readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort();
  let latest: { file: string; body: string } | undefined;
  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
    const start = sql.lastIndexOf(marker);
    if (start === -1) continue;
    latest = { file, body: sql.slice(start) };
  }
  if (!latest) throw new Error(`no migration defines ${viewName}`);
  return latest;
}

/**
 * Is THIS helper call guarded — not "does the policy body mention a guard
 * somewhere".
 *
 * MYK9-585 review round 1 killed the whole-body version of this check with a
 * two-line probe: re-ALTER `trials_select` keeping
 * `s.club_id IS NOT NULL AND is_club_admin(s.club_id)` and dropping the guard
 * from the `is_trial_secretary(s.club_id)` arm beside it, and a body-level
 * `/club_id is not null/` test stays green while half the policy is exploitable
 * again. That is the same "a guarded call satisfies the check on behalf of an
 * unguarded one" failure the function-scanner header rejects three heuristics
 * for, reappearing one abstraction down.
 *
 * So this decides the ONE question a regex can actually answer about SQL
 * boolean structure: walking from the call outward through its enclosing
 * parenthesis groups, does some group AND the guard onto this call?
 *
 *   1. Take the text from a group's opening paren to the call.
 *   2. Mask every NESTED parenthesis group in it. What survives is that
 *      group's own top level — a guard sitting inside a sibling `(... AND ...)`
 *      arm is masked out, which is exactly what defeats the probe above.
 *   3. Keep only what follows the LAST top-level `OR`. That is the conjunct the
 *      call belongs to; anything before an `OR` is a different arm and cannot
 *      guard it.
 *   4. The guard must name the SAME column the call passes.
 *
 * Deliberately NOT a SQL parser, and it does not need to be: it can be fooled
 * only into calling a guarded call unguarded (a guard expressed some way this
 * does not recognise), which fails loud and a human reads the SQL — never the
 * other way, which is the direction that ships a hole. The REGISTRY above is
 * still what catches a call site nobody has looked at; this is what catches a
 * site that is listed but not actually guarded.
 */
export function isCallGuarded(
  body: string,
  callIndex: number,
  argument: string,
  table: string
): boolean {
  // The guard may name the column exactly as the call does (`s.club_id IS NOT
  // NULL`), or bare (`club_id IS NOT NULL`) — but bare ONLY when the argument
  // is the policy's own table's column, since a bare `club_id` in a policy body
  // is that table's row. Accepting bare for an aliased argument would let
  // another table's guard vouch for this call.
  const column = argument.includes('.') ? argument.slice(argument.indexOf('.') + 1) : argument;
  const qualifier = argument.includes('.') ? argument.slice(0, argument.indexOf('.')) : '';
  const ownTable = qualifier === '' || qualifier.toLowerCase() === table.toLowerCase();
  const forms = ownTable ? [argument, column] : [argument];
  const guard = new RegExp(
    `(?:${forms.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s+IS\\s+NOT\\s+NULL`,
    'i'
  );

  // Every parenthesis group still open at the call, innermost last, plus the
  // whole body as the outermost scope.
  const openings: number[] = [];
  for (let i = 0; i < callIndex; i += 1) {
    if (body[i] === '(') openings.push(i);
    else if (body[i] === ')') openings.pop();
  }
  const scopes = [...openings].reverse();
  scopes.push(-1);

  for (const start of scopes) {
    const inner = body.slice(start + 1, callIndex);

    let depth = 0;
    let topLevel = '';
    for (const character of inner) {
      if (character === '(') {
        depth += 1;
        topLevel += ' ';
      } else if (character === ')') {
        depth = Math.max(0, depth - 1);
        topLevel += ' ';
      } else {
        topLevel += depth > 0 ? ' ' : character;
      }
    }

    const orSplits = [...topLevel.matchAll(/\bOR\b/gi)];
    const lastOr = orSplits.length > 0 ? orSplits[orSplits.length - 1]! : undefined;
    const conjunct = lastOr ? topLevel.slice(lastOr.index + lastOr[0].length) : topLevel;

    if (guard.test(conjunct)) return true;
  }

  return false;
}
