/**
 * MYK9-1019 parity: the client's wait-list rule and the server's give the same
 * answer for show on/off x class null/true/false.
 *
 * The expected answers are read from the behavioural SQL test that CI runs
 * against the real functions (supabase/tests/myk9_1019_show_wide_allow_waitlist_test.sql:
 * P1 show off, P2 show on, each reader's answer per class), so a change to
 * either side that the other does not follow fails here. The client rule is
 * only for Edit class's inherited label, which reads the replica offline.
 *
 * The cart never resolves the setting: it takes the server's effective
 * allow_waitlist from its availability rows (cartCapacityFromJudgeDays), and
 * the split is checked here to route a full class exactly as the server's
 * decision does when fed the server's own answer.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classAllowsWaitlist } from './classAllowsWaitlist';
import { splitCartItemsByJudgeDayCapacity } from '@/features/payments/cartCapacitySplit';
import {
  cartCapacityFromJudgeDays,
  type ClassJudgeDayAvailabilityRow,
} from '@/features/payments/cartCapacityFromJudgeDays';
import type { CartItemWithDetails } from '@/store/cartStore';

const REPO = resolve(__dirname, '../../../..');
const SQL_TEST = resolve(REPO, 'supabase/tests/myk9_1019_show_wide_allow_waitlist_test.sql');
const MIGRATIONS_DIR = resolve(REPO, 'supabase/migrations');

/** The SQL test's classes, in the order its readers() line lists them. */
const CLASS_SETTINGS = [
  ['CN', null],
  ['CY', true],
  ['CX', false],
] as const;

/**
 * The SQL test's expected readers() line for a phase, one entry per class:
 * helper/availability/block/wizard/decision.
 */
function serverAnswers(phase: 'P1' | 'P2'): string[][] {
  const sql = readFileSync(SQL_TEST, 'utf8');
  const match = sql.match(new RegExp(`pg_temp\\.readers\\('\\d+'\\),\\s*'([^']+)',\\s*'${phase} `));
  if (!match) throw new Error(`no ${phase} readers() expectation in ${SQL_TEST}`);
  return match[1]!.split(' | ').map(cell => cell.split('/'));
}

function fullClassLine(classId: string): CartItemWithDetails {
  return {
    id: `item-${classId}`,
    cart_id: 'cart-1',
    class_id: classId,
    dog_id: 'dog-1',
    handler_id: null,
    entry_fee_cents: 3000,
    jump_height: null,
    special_requests: null,
    junior_fee_declared: false,
    created_at: '2026-10-05T00:00:00.000Z',
    class: {
      id: classId,
      name: classId,
      level: null,
      trial_id: 'trial-1',
    },
  };
}

describe('classAllowsWaitlist parity with class_allows_waitlist (MYK9-1019)', () => {
  const phases = [
    ['P1', false],
    ['P2', true],
  ] as const;

  it.each(phases)('%s: every server reader agrees with itself', phase => {
    for (const [helper, availability, block, wizard, decision] of serverAnswers(phase)) {
      expect([availability, wizard]).toEqual([helper, helper]);
      expect(block).toBe(helper === 'true' ? 'open' : 'full');
      expect(decision).toBe(helper === 'true' ? 'waitlisted' : 'denied');
    }
  });

  it.each(phases)(
    '%s (show %s): the client rule gives the server answer per class',
    (phase, show) => {
      const answers = serverAnswers(phase);
      expect(answers).toHaveLength(CLASS_SETTINGS.length);
      CLASS_SETTINGS.forEach(([, classSetting], index) => {
        expect(String(classAllowsWaitlist(classSetting, show))).toBe(answers[index]![0]);
      });
    }
  );

  it.each(phases)(
    "%s (show %s): fed the server's rows, the cart sends a full class where the server would",
    phase => {
      const answers = serverAnswers(phase);
      // The cart's read for each full class, carrying the server's effective
      // allow_waitlist (class_entry_availability's answer in the SQL test).
      const rows = CLASS_SETTINGS.map(
        ([name], index) =>
          ({
            class_id: name,
            class_max_entries: 1,
            class_entry_count: 1,
            class_remaining: 0,
            class_full: true,
            allow_waitlist: answers[index]![1] === 'true',
            self_service_block: answers[index]![2] === 'open' ? null : 'full',
            judge_id: null,
            show_date: null,
            day_capacity: null,
            day_taken: null,
            day_mail_in_reserved: null,
            day_remaining: null,
          }) as ClassJudgeDayAvailabilityRow
      );
      const facts = cartCapacityFromJudgeDays(rows);
      const decision = splitCartItemsByJudgeDayCapacity(
        CLASS_SETTINGS.map(([name]) => fullClassLine(name)),
        facts.judgeDays,
        facts.classSpots,
        facts.waitlistClassIds
      );
      CLASS_SETTINGS.forEach(([name], index) => {
        const serverWaitlists = answers[index]![4] === 'waitlisted';
        expect(decision.waitlistItemIds.has(`item-${name}`)).toBe(serverWaitlists);
        expect(decision.blockedItems.some(line => line.id === `item-${name}`)).toBe(
          !serverWaitlists
        );
      });
    }
  );

  it('a missing show value is "no", like the column default', () => {
    expect(classAllowsWaitlist(null, undefined)).toBe(false);
    expect(classAllowsWaitlist(undefined, null)).toBe(false);
    expect(classAllowsWaitlist(true, undefined)).toBe(true);
  });
});

/**
 * Every database function whose LATEST definition reads the class column must
 * decide through class_allows_waitlist, so no reader is left on the old
 * class-only rule. A later CREATE OR REPLACE that copies an old body back
 * fails here.
 */
describe('no server reader decides on the class column alone', () => {
  function latestDefinitions(): Map<string, string> {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter(name => name.endsWith('.sql'))
      .sort();
    const latest = new Map<string, string>();
    for (const file of files) {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
      const marker = /CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g;
      for (const match of sql.matchAll(marker)) {
        const bodyOpen = sql.indexOf('$', match.index);
        const tag = sql.slice(bodyOpen, sql.indexOf('$', bodyOpen + 1) + 1);
        const bodyStart = bodyOpen + tag.length;
        latest.set(match[1]!, sql.slice(bodyStart, sql.indexOf(tag, bodyStart)));
      }
    }
    return latest;
  }

  const definitions = latestDefinitions();

  it('the rule itself is class first, then show, then no', () => {
    const rule = definitions.get('class_allows_waitlist')?.replace(/\s+/g, ' ').trim();
    expect(rule).toContain('COALESCE(c.allow_waitlist, s.allow_waitlist)');
    expect(rule).toMatch(/\), false \);$/);
  });

  it('the capacity readers call it', () => {
    for (const fn of ['evaluate_entry_capacity', 'class_entry_availability', 'hold_cart_spots']) {
      expect(definitions.get(fn), fn).toContain('public.class_allows_waitlist(');
    }
  });

  it('no latest definition reads the class column into a decision raw', () => {
    const raw = /COALESCE\(\s*(?:c|cl|classes)\.allow_waitlist\s*,\s*false\s*\)/i;
    const offenders = [...definitions].filter(([, body]) => raw.test(body)).map(([fn]) => fn);
    expect(offenders).toEqual([]);
  });
});
