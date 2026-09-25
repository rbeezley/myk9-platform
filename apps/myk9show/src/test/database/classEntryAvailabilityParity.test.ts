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
import { SEAT_HOLDING_ENTRY_STATUSES } from '@/utils/waitlistCountSelectors';

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

/** The values `entries_entry_status_check` allows, from the LATEST migration that sets it. */
function entryStatusCheckValues(): { file: string; values: string[] } {
  const marker = 'ADD CONSTRAINT entries_entry_status_check CHECK';
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i -= 1) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, files[i]!), 'utf8');
    const start = sql.lastIndexOf(marker);
    if (start === -1) continue;
    const list = sql.slice(sql.indexOf('(', start + marker.length), sql.indexOf(');', start));
    const values = [...list.replace(/--[^\n]*/g, '').matchAll(/'([^']+)'/g)].map(m => m[1]!);
    return { file: files[i]!, values };
  }
  throw new Error('no migration sets entries_entry_status_check');
}

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

  // MYK9-753: the class -> judge-day mapping lives in ONE helper,
  // class_judge_day_capacity, which the wizard's verdict and the cart's
  // per-day read both call. The arithmetic stays in get_judge_day_capacity_live.
  it('reads judge-day capacity through class_judge_day_capacity, which calls get_judge_day_capacity_live', () => {
    const helper = latestDefinition('class_judge_day_capacity');
    expect(compact(availability.body)).toContain('public.class_judge_day_capacity(p_class_ids)');
    expect(compact(availability.body)).not.toContain('get_judge_day_capacity_live');
    expect(compact(helper.body)).toContain('public.get_judge_day_capacity_live(');
    expect(helper.body).toContain('COALESCE(jd.available_spots, 0)');
  });

  it("maps a class to exactly evaluate_entry_capacity's judge days", () => {
    const helper = compact(latestDefinition('class_judge_day_capacity').body);
    const evaluateBody = compact(evaluate.body);
    // evaluate_entry_capacity's loop: confirmed, named judges of the class in its show.
    expect(evaluateBody).toContain("AND ja.status = 'confirmed' AND ja.person_id IS NOT NULL");
    expect(evaluateBody).toContain(
      'get_judge_day_capacity_live(v_judge_id, resolved_show_id, v_trial_date)'
    );
    expect(helper).toContain(
      "ON ja.class_id = c.id AND ja.show_id = t.show_id AND ja.status = 'confirmed' AND ja.person_id IS NOT NULL"
    );
    expect(helper).toContain('get_judge_day_capacity_live( d.person_id, d.show_id, d.trial_date )');
  });

  it("gates the cart's per-day read on the wizard read's show visibility", () => {
    const visibility = (body: string) =>
      compact(body).match(/s\.deleted_at IS NULL AND \(.*?is_show_official\(p_show_id\) \)/)?.[0];
    const wizard = visibility(latestDefinition('get_show_class_availability').body);
    expect(wizard).toBeDefined();
    expect(visibility(latestDefinition('get_show_class_judge_day_availability').body)).toBe(wizard);
  });

  it('refuses a paid line on the same closure verdict, checked before any wait-list write', () => {
    const paid = compact(latestDefinition('create_online_paid_entry').body);
    const closure = paid.indexOf('public.class_entry_availability(ARRAY[p_class_id])');
    expect(closure).toBeGreaterThan(-1);
    expect(paid).toContain("IF v_block IN ('cancelled', 'started', 'finished') THEN");
    expect(closure).toBeLessThan(paid.indexOf('public.evaluate_entry_capacity('));
  });

  it('treats a class as started exactly when submit_show_entries refuses it as running', () => {
    const started = '(e.is_in_ring IS TRUE OR e.is_scored IS TRUE)';
    expect(compact(submit.body)).toContain(started);
    expect(compact(availability.body)).toContain(started);
  });

  // MYK9-754: every client seat count (the Waitlist tab's "Entered", both
  // move-up capacity guards) reads SEAT_HOLDING_ENTRY_STATUSES. If it drifts
  // from the server's count, a move-up or promote is offered into a class the
  // server calls full.
  it("pins the client's seat-holding status set to the server's capacity count", () => {
    const [evaluateList] = capacityStatusLists(evaluate.body);
    expect([...SEAT_HOLDING_ENTRY_STATUSES].sort()).toEqual(evaluateList);
  });

  it('only counts statuses the entries CHECK constraint allows', () => {
    const check = entryStatusCheckValues();
    // Positive control: the latest constraint, and a list that parsed.
    expect(check.file >= '20260924094300').toBe(true);
    expect(check.values).toContain('pending-payment');
    expect(check.values).not.toContain('waitlisted');
    for (const status of SEAT_HOLDING_ENTRY_STATUSES) {
      expect(check.values).toContain(status);
    }
  });
});
