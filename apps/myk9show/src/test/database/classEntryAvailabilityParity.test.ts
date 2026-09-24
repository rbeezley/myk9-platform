/**
 * MYK9-705 / MYK9-656: `class_entry_availability` restates two predicates it
 * cannot call, so it must keep agreeing with the functions that own them.
 *
 *   - which entries count toward capacity: `evaluate_entry_capacity` (the
 *     submit's decision) and `get_judge_day_capacity_live`;
 *   - what "this class has started" means: `submit_show_entries`.
 *
 * Each function is read from the LATEST migration that defines it, so a later
 * CREATE OR REPLACE on either side is what gets compared. A status added to the
 * submit's count but not the wizard's would make the wizard say "open" to a
 * class the submit refuses (the MYK9-173 drift), and this fails instead.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');

function latestDefinition(fn: string): { file: string; body: string } {
  const marker = `CREATE OR REPLACE FUNCTION public.${fn}(`;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i -= 1) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, files[i]!), 'utf8');
    const start = sql.lastIndexOf(marker);
    if (start === -1) continue;
    const bodyOpen = sql.indexOf('$', start);
    const tag = sql.slice(bodyOpen, sql.indexOf('$', bodyOpen + 1) + 1);
    const bodyStart = bodyOpen + tag.length;
    const bodyEnd = sql.indexOf(tag, bodyStart);
    return { file: files[i]!, body: sql.slice(bodyStart, bodyEnd) };
  }
  throw new Error(`no migration defines public.${fn}`);
}

/** Every `entry_status IN (...)` list in a body, each as a sorted status set. */
function capacityStatusLists(body: string): string[][] {
  return [...body.matchAll(/entry_status\s+IN\s*\(([^)]*)\)/gi)].map(match =>
    [...match[1]!.matchAll(/'([^']+)'/g)].map(status => status[1]!).sort()
  );
}

const compact = (sql: string) => sql.replace(/\s+/g, ' ');

describe('class_entry_availability parity', () => {
  const availability = latestDefinition('class_entry_availability');
  const evaluate = latestDefinition('evaluate_entry_capacity');
  const judgeDay = latestDefinition('get_judge_day_capacity_live');
  const submit = latestDefinition('submit_show_entries');

  it('reads each function from its latest defining migration', () => {
    expect(availability.file >= '20260925004700').toBe(true);
    expect(evaluate.file >= '20260712210000').toBe(true);
    expect(submit.file >= '20260918211700').toBe(true);
  });

  it('counts exactly the entry statuses the submit counts toward capacity', () => {
    const [evaluateList, ...evaluateRest] = capacityStatusLists(evaluate.body);
    const judgeDayLists = capacityStatusLists(judgeDay.body);
    const availabilityLists = capacityStatusLists(availability.body);

    // Positive controls: the extraction found the lists it compares.
    expect(evaluateRest).toEqual([]);
    expect(evaluateList).toHaveLength(7);
    expect(judgeDayLists).toHaveLength(1);
    expect(availabilityLists).toHaveLength(1);

    expect(availabilityLists[0]).toEqual(evaluateList);
    expect(judgeDayLists[0]).toEqual(evaluateList);
  });

  it('reads judge-day capacity by calling get_judge_day_capacity_live, not restating it', () => {
    expect(compact(availability.body)).toContain('public.get_judge_day_capacity_live(');
    expect(availability.body).toContain('available_spots');
  });

  it('treats a class as started exactly when submit_show_entries refuses it as running', () => {
    const started = '(e.is_in_ring IS TRUE OR e.is_scored IS TRUE)';
    expect(compact(submit.body)).toContain(started);
    expect(compact(availability.body)).toContain(started);
  });
});
