import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The secretary entry read has two paths. The warm path reads replicated rows,
 * which `ReplicatedEntriesTable` pulls from `view_authenticated_entry_results`.
 * The cold-store fallback (`secretary.ts` -> `postgrestGetSecretaryEntriesForShow`)
 * is the one that runs on a brand-new show, a new device, or cleared storage.
 *
 * `20260620001929_restrict_authenticated_entry_results.sql` deliberately revoked
 * the scored columns from `authenticated` and re-exposed them through that
 * owner-run view. A fallback that selects them straight off `public.entries`
 * therefore fails wholesale with `42501 permission denied for table entries` --
 * PostgREST rejects the request, not just the forbidden columns -- so the
 * secretary sees "Couldn't load entries" exactly when the cache cannot help.
 *
 * Dropping the columns instead is not an option: `ReportsPage/reportDataMapping.ts`
 * feeds `result_status`, `search_time_seconds`, `total_faults` and
 * `final_placement` into the secretary's printed reports, so a trimmed select
 * would silently blank the registry paperwork.
 */
const source = readFileSync(
  resolve(__dirname, '../../services/database/entries/secretaryPostgrest.ts'),
  'utf8'
);

/** Revoked from `authenticated` by 20260620001929; readable only via the view. */
const FORBIDDEN_ON_ENTRIES = [
  'result_status',
  'search_time_seconds',
  'total_faults',
  'total_score',
  'final_placement',
  'judge_notes',
  'judge_signature',
  'disqualification_reason',
  'video_review_notes',
];

const GATED_RESULT_VIEW = 'view_authenticated_entry_results';

/** Relation names passed to `.from(...)` anywhere in the fallback module. */
function relationsRead(src: string): string[] {
  return [...src.matchAll(/\.from\(\s*'([^']+)'\s*\)/g)].map(m => m[1]);
}

/**
 * Bare column tokens in a select body: identifiers on their own line, ignoring
 * embed headers (`alias:fk (`) and the embedded blocks' own columns is not
 * necessary here -- an embed's columns are checked against ITS table, and no
 * embedded table in this select is column-gated.
 */
function topLevelColumns(selectBody: string): string[] {
  const out: string[] = [];
  let depth = 0;
  for (const rawLine of selectBody.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const opens = (line.match(/\(/g) ?? []).length;
    const closes = (line.match(/\)/g) ?? []).length;
    if (depth === 0) {
      const m = /^([a-z_][a-z0-9_]*)\s*,?$/i.exec(line);
      if (m) out.push(m[1]);
    }
    depth += opens - closes;
    if (depth < 0) depth = 0;
  }
  return out;
}

/**
 * Every `.from('<relation>').select(<arg>)` pair in the module, with the select
 * argument resolved when it names one of the module's select constants.
 */
function readsWithSelect(src: string): Array<{ relation: string; columns: string[] }> {
  const constants = new Map<string, string>();
  for (const m of src.matchAll(/const (SECRETARY_ENTRIES_[A-Z_]+) = `([\s\S]*?)`;/g)) {
    constants.set(m[1], m[2]);
  }
  // SECRETARY_ENTRIES_SELECT is defined by interpolating the BASE one.
  for (const [name, body] of [...constants]) {
    constants.set(name, body.replace(/\$\{(SECRETARY_ENTRIES_[A-Z_]+)\}/g, (_, ref) => constants.get(ref) ?? ''));
  }

  const out: Array<{ relation: string; columns: string[] }> = [];
  for (const m of src.matchAll(/\.from\(\s*'([^']+)'\s*\)\s*\.select\(([\s\S]*?)\)\s*\./g)) {
    const relation = m[1];
    const arg = m[2];
    const named = [...arg.matchAll(/(SECRETARY_ENTRIES_[A-Z_]+)/g)].map(x => x[1]);
    const bodies = named.length
      ? named.map(n => constants.get(n) ?? '')
      : [...arg.matchAll(/'([^']*)'/g)].map(x => x[1]);
    for (const body of bodies) {
      out.push({ relation, columns: topLevelColumns(body.includes('\n') ? body : body.split(',').join('\n')) });
    }
  }
  return out;
}

describe('secretary cold-store entry fallback — authenticated grant contract — authenticated grant contract', () => {
  it('reads the gated result view, not public.entries', () => {
    const relations = relationsRead(source);
    expect(relations.length).toBeGreaterThan(0);
    expect(relations).toContain(GATED_RESULT_VIEW);
  });

  it('never selects a revoked scored column off public.entries', () => {
    const reads = readsWithSelect(source);
    expect(reads.length).toBeGreaterThan(0);

    for (const { relation, columns } of reads) {
      if (relation !== 'entries') continue;
      const revoked = columns.filter(c => FORBIDDEN_ON_ENTRIES.includes(c));
      expect(
        revoked,
        `public.entries read selects revoked column(s): ${revoked.join(', ')}`
      ).toEqual([]);
    }
  });

  it('still asks the view for the scored columns the reports need', () => {
    const viewRead = readsWithSelect(source).find(
      r => r.relation === GATED_RESULT_VIEW
    );
    expect(viewRead, `no .from('${GATED_RESULT_VIEW}') select found`).toBeDefined();
    // ReportsPage/reportDataMapping.ts consumes these; a trimmed select would
    // silently blank the secretary's printed registry paperwork.
    for (const needed of ['result_status', 'search_time_seconds', 'total_faults', 'final_placement']) {
      expect(viewRead!.columns).toContain(needed);
    }
  });
});
