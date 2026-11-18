/**
 * MYK9-579 — pins the DB trigger's RAISE EXCEPTION text to the exact TS
 * constants it is supposed to mirror. The trigger's own comment claims its
 * copy IS onlineEntryGate.ts's friendly text (so isPublishGateDbError callers
 * can trust `error.message` without a second lookup table) -- nothing else
 * enforces that the two stay byte-identical after an edit to either side.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PUBLISH_BLOCKED_MESSAGE,
  CLUB_REQUIRED_MESSAGE,
  ENTRY_WINDOW_REQUIRED_MESSAGE,
  ENTRY_WINDOW_ORDER_MESSAGE,
  ENTRY_WINDOW_PUBLISHED_MESSAGE,
  ONLINE_ENTRIES_BLOCKED_MESSAGE,
  ONLINE_ENTRIES_REQUIRED_MESSAGE,
  ONLINE_ENTRIES_ALWAYS_ON_MESSAGE,
  PUBLIC_SHOW_STATUSES,
  PUBLISH_GATE_ERRCODE_ENTRY_WINDOW,
} from '@/features/payments/onlineEntryGate';

// Resolved by content, not a hard-coded filename: the function body under
// test is the one in the LATEST migration that (re)defines it (MYK9-716
// replaced 20260916003500's body), and the trigger wiring is the latest
// migration that creates the trigger. Migration versions sort
// lexicographically, so the last match is the one applied last.
const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');

function latestMigrationContaining(marker: RegExp): string {
  const matches = readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .filter(name => marker.test(readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8')));
  const latest = matches.at(-1);
  if (!latest) {
    throw new Error(`expected a migration matching ${marker} in ${MIGRATIONS_DIR}, found none`);
  }
  return readFileSync(resolve(MIGRATIONS_DIR, latest), 'utf8');
}

function migrationSql(): string {
  return latestMigrationContaining(
    /CREATE OR REPLACE FUNCTION public\.enforce_show_publish_gate\(\)/
  );
}

/** enforce_show_publish_gate's own body, without the rest of its migration. */
function gateFunctionBody(): string {
  const sql = migrationSql();
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.enforce_show_publish_gate()');
  const end = sql.indexOf('$$;', start);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, end);
}

/** MYK9-979's migration: it created private.show_status_is_public and the
 * online_entries_enabled backfill. A later migration that only re-creates the
 * gate function (MYK9-1887) carries neither, so these are read from here. */
function onlineEntriesSwitchSql(): string {
  return readFileSync(
    resolve(MIGRATIONS_DIR, '20261003221700_myk9_979_online_entries_switch.sql'),
    'utf8'
  );
}

function triggerSql(): string {
  return latestMigrationContaining(/CREATE TRIGGER trg_enforce_show_publish_gate\b/);
}

/** A SQL string literal escapes an apostrophe as `''`, not `'` -- compare
 * against that form rather than the raw TS constant. */
function sqlEscaped(text: string): string {
  return text.replace(/'/g, "''");
}

describe('enforce_show_publish_gate migration text', () => {
  it('resolves the latest enforce_show_publish_gate definition', () => {
    expect(() => migrationSql()).not.toThrow();
    expect(migrationSql()).toMatch(/MYK9-2163/);
  });

  // MYK9-1887: secretary-facing refusal text carries no em dash. The
  // client constants mirror it, so checking the function body covers both.
  it('raises no message with an em dash', () => {
    const raised = [...gateFunctionBody().matchAll(/RAISE EXCEPTION '((?:[^']|'')*)'/g)];
    expect(raised).toHaveLength(10);
    for (const [, message] of raised) expect(message).not.toContain('\u2014');
  });

  it('raises PUBLISH_BLOCKED_MESSAGE verbatim for the no-Stripe-readiness refusal', () => {
    const sql = migrationSql();
    expect(sql).toContain(sqlEscaped(PUBLISH_BLOCKED_MESSAGE));
  });

  it('raises CLUB_REQUIRED_MESSAGE verbatim for the missing-club refusal', () => {
    const sql = migrationSql();
    expect(sql).toContain(sqlEscaped(CLUB_REQUIRED_MESSAGE));
  });

  // MYK9-979: four MK003 raises — the missing club and the Stripe refusal on
  // becoming public, and the same two on turning online entries on for a
  // show that is already public. MYK9-2163 adds three more: creating a show
  // with online entries off or turning them off (any status), and a legacy
  // off row becoming public or edited while public. Counted inside the
  // function body only.
  it('raises every club / Stripe / online-entries refusal with SQLSTATE MK003', () => {
    const mk003Count = (gateFunctionBody().match(/USING ERRCODE = 'MK003'/g) ?? []).length;
    expect(mk003Count).toBe(7);
  });

  it('raises ONLINE_ENTRIES_BLOCKED_MESSAGE verbatim for turning online entries on (MYK9-979)', () => {
    expect(gateFunctionBody()).toContain(sqlEscaped(ONLINE_ENTRIES_BLOCKED_MESSAGE));
  });

  // MYK9-2163 reverses MYK9-979's "only when online entries are on": the
  // payouts check on becoming public is unconditional, through the one
  // helper that carries the demo-club exemption.
  it('checks payouts on becoming public whatever online entries say (MYK9-2163)', () => {
    const body = gateFunctionBody();
    expect(body).not.toContain('IF NEW.online_entries_enabled IS TRUE THEN');
    const payoutsGuard = body.lastIndexOf(
      'IF NOT private.club_publish_payouts_ok(NEW.club_id) THEN'
    );
    expect(payoutsGuard).toBeGreaterThan(-1);
    const blocked = body.indexOf(sqlEscaped(PUBLISH_BLOCKED_MESSAGE));
    expect(blocked).toBeGreaterThan(payoutsGuard);
    expect(body).not.toMatch(/public\.can_accept_online_entry_payment\(/);
  });

  it('refuses online entries off on a public show, after the payouts check (MYK9-2163)', () => {
    const body = gateFunctionBody();
    const required = sqlEscaped(ONLINE_ENTRIES_REQUIRED_MESSAGE);
    expect(body.split(required)).toHaveLength(3);
    expect(body.lastIndexOf(required)).toBeGreaterThan(
      body.indexOf(sqlEscaped(PUBLISH_BLOCKED_MESSAGE))
    );
    expect(body.lastIndexOf(required)).toBeLessThan(
      body.indexOf(sqlEscaped(ENTRY_WINDOW_REQUIRED_MESSAGE))
    );
  });

  // MYK9-2163: on ANY status, before the non-public early return, so a draft
  // can never be created with online entries off or switched off.
  it('refuses creating a show with online entries off or turning them off, on any status (MYK9-2163)', () => {
    const body = gateFunctionBody();
    const alwaysOn = body.indexOf(sqlEscaped(ONLINE_ENTRIES_ALWAYS_ON_MESSAGE));
    expect(alwaysOn).toBeGreaterThan(-1);
    expect(body.split(sqlEscaped(ONLINE_ENTRIES_ALWAYS_ON_MESSAGE))).toHaveLength(2);
    const guard = body.indexOf(
      "IF (TG_OP = 'INSERT' AND NEW.online_entries_enabled IS NOT TRUE)\n" +
        "     OR (TG_OP = 'UPDATE' AND OLD.online_entries_enabled IS TRUE\n" +
        '         AND NEW.online_entries_enabled IS NOT TRUE) THEN'
    );
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(alwaysOn);
    expect(alwaysOn).toBeLessThan(
      body.indexOf('IF NOT private.show_status_is_public(NEW.status) THEN')
    );
  });

  it('exempts demo clubs from the payouts check in one helper, in the platform mode (MYK9-2163)', () => {
    const helper = migrationSql().match(
      /CREATE OR REPLACE FUNCTION private\.club_publish_payouts_ok\(p_club_id uuid\)[\s\S]*?\$\$;/
    )?.[0];
    expect(helper).toBeTruthy();
    expect(helper).toMatch(/c\.is_demo IS TRUE/);
    expect(helper).toMatch(
      /can_accept_online_entry_payment\(\s*p_club_id,\s*\(SELECT ps\.stripe_livemode FROM public\.platform_settings ps WHERE ps\.id = true\)/
    );
  });

  it('starts new shows with online entries on and turns every existing show on (MYK9-2163)', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/ALTER COLUMN online_entries_enabled SET DEFAULT true;/);
    // The Add Show RPC ignores p_show.online_entries_enabled: every new show is on.
    expect(sql).toContain(
      '    true,  -- MYK9-2163: always on; p_show.online_entries_enabled is ignored.'
    );
    expect(sql).not.toMatch(/p_show->>'online_entries_enabled'/);
    const dataUpdate = sql.match(
      /UPDATE public\.shows\n {3}SET online_entries_enabled = true,\n {7}updated_at = now\(\)\n WHERE online_entries_enabled IS DISTINCT FROM true;/
    )?.[0];
    expect(dataUpdate).toBeTruthy();
    // The behavioral SQL test replays this exact statement.
    const sqlTest = readFileSync(
      resolve(MIGRATIONS_DIR, '../tests/myk9_2163_publish_needs_payouts_test.sql'),
      'utf8'
    );
    expect(sqlTest).toContain(dataUpdate);
  });

  it('keys the gate on the one public-status predicate, whose list matches the client mirror', () => {
    const sql = latestMigrationContaining(
      /CREATE OR REPLACE FUNCTION private\.show_status_is_public\b/
    );
    const predicate = sql.match(
      /CREATE OR REPLACE FUNCTION private\.show_status_is_public[\s\S]*?ARRAY\[([^\]]+)\]/
    );
    const statuses = [...(predicate?.[1] ?? '').matchAll(/'([a-z_]+)'::text/g)].map(m => m[1]);
    expect(statuses).toEqual([...PUBLIC_SHOW_STATUSES]);
    expect(gateFunctionBody()).toMatch(/private\.show_status_is_public\(NEW\.status\)/);
  });

  // MYK9-716: publishing requires an entry window.
  it('raises the entry-window refusals verbatim with their own SQLSTATE', () => {
    const sql = migrationSql();
    expect(sql).toContain(sqlEscaped(ENTRY_WINDOW_REQUIRED_MESSAGE));
    expect(sql).toContain(sqlEscaped(ENTRY_WINDOW_ORDER_MESSAGE));
    const code = `USING ERRCODE = '${PUBLISH_GATE_ERRCODE_ENTRY_WINDOW}'`;
    expect(sql.split(code)).toHaveLength(4);
  });

  it('checks the entry window after the Stripe refusal, so MK003 keeps precedence', () => {
    const sql = migrationSql();
    expect(sql.indexOf(sqlEscaped(ENTRY_WINDOW_REQUIRED_MESSAGE))).toBeGreaterThan(
      sql.indexOf(sqlEscaped(PUBLISH_BLOCKED_MESSAGE))
    );
  });

  it('fires on INSERT and on UPDATE OF status, either entry date or the online switch (MYK9-716, MYK9-979)', () => {
    expect(triggerSql()).toMatch(
      /BEFORE INSERT OR UPDATE OF status, entry_open_date, entry_close_date, online_entries_enabled ON public\.shows/
    );
  });

  // The window is compared as the UTC calendar day, the reading every
  // entry-open/close guard uses, never as a raw timestamptz: a legacy
  // non-midnight value must not invert a same-day window by its time of day.
  it('compares the entry dates by UTC calendar day, never as raw timestamps', () => {
    const sql = migrationSql();
    const dayComparison =
      /\(NEW\.entry_open_date AT TIME ZONE 'UTC'\)::date\s+>\s+\(NEW\.entry_close_date AT TIME ZONE 'UTC'\)::date/g;
    expect(sql.match(dayComparison)).toHaveLength(2);
    expect(sql).not.toMatch(/NEW\.entry_open_date\s*>\s*NEW\.entry_close_date/);
  });

  // Codex P2: every stored date is midnight UTC of its UTC calendar day, so a
  // client can read a stored value's day without guessing its shape.
  describe('legacy date normalization', () => {
    const MIGRATION = readFileSync(
      resolve(MIGRATIONS_DIR, '20260925023700_myk9_716_publish_requires_entry_window.sql'),
      'utf8'
    );
    const NORMALIZE = /UPDATE public\.shows\n {3}SET start_date[\s\S]*?;/;

    it('rewrites all four date columns to midnight UTC of their UTC day, before the gate changes', () => {
      const statement = MIGRATION.match(NORMALIZE)?.[0] ?? '';
      for (const column of ['start_date', 'end_date', 'entry_open_date', 'entry_close_date']) {
        const day = `\\(${column}\\s+AT TIME ZONE 'UTC'\\)::date::timestamp AT TIME ZONE 'UTC'`;
        expect(statement).toMatch(new RegExp(`${column}\\s+=\\s+${day}`));
        expect(statement).toMatch(new RegExp(`${column}\\s+IS DISTINCT FROM\\s+${day}`));
      }
      const at = MIGRATION.indexOf(statement);
      expect(at).toBeGreaterThan(MIGRATION.indexOf('BEGIN;'));
      expect(at).toBeLessThan(
        MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.enforce_show_publish_gate()')
      );
      expect(at).toBeLessThan(MIGRATION.indexOf('CREATE TRIGGER trg_enforce_show_publish_gate'));
    });

    it('is exercised verbatim by the behavioral SQL test', () => {
      const statement = MIGRATION.match(NORMALIZE)?.[0];
      const sqlTest = readFileSync(
        resolve(MIGRATIONS_DIR, '../tests/show_publish_gate_trigger_test.sql'),
        'utf8'
      );
      expect(statement).toBeTruthy();
      expect(sqlTest).toContain(statement);
    });
  });

  // MYK9-979 (Codex P2 on #2707): replicas pull shows on updated_at, so the
  // backfill must write EVERY row (no WHERE) and bump updated_at; the
  // behavioral SQL test replays this exact statement.
  describe('online_entries_enabled backfill', () => {
    const BACKFILL = /UPDATE public\.shows s\n {3}SET online_entries_enabled = \([\s\S]*?\);/;

    it('writes every show and bumps updated_at', () => {
      const statement = onlineEntriesSwitchSql().match(BACKFILL)?.[0] ?? '';
      // Everything after the SET value expression: only the updated_at bump,
      // no WHERE that could leave a row at the column default.
      const tail = statement.split('\n       ),\n')[1];
      expect(tail).toBe('       updated_at = now();');
    });

    it('is exercised verbatim by the behavioral SQL test', () => {
      const statement = onlineEntriesSwitchSql().match(BACKFILL)?.[0];
      const sqlTest = readFileSync(
        resolve(MIGRATIONS_DIR, '../tests/myk9_979_online_entries_switch_test.sql'),
        'utf8'
      );
      expect(statement).toBeTruthy();
      expect(sqlTest).toContain(statement);
    });
  });

  it('raises the published-window refusal verbatim', () => {
    expect(migrationSql()).toContain(sqlEscaped(ENTRY_WINDOW_PUBLISHED_MESSAGE));
  });
});
