import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findUndecidedPublicObjects } from './migrationGrantDecisionContract';

const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');

describe('public migration grant decisions', () => {
  it('rejects a new public function without an explicit execute decision', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120001_unsafe_function.sql',
        sql: `
          CREATE FUNCTION public.unsafe_probe()
          RETURNS boolean
          LANGUAGE sql
          SECURITY DEFINER
          AS $$ SELECT true $$;
          REVOKE EXECUTE ON FUNCTION public.unsafe_probe() FROM authenticated;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120001_unsafe_function.sql: public.unsafe_probe() has no anon EXECUTE decision',
    ]);
  });

  it('does not let a keep-listed overload cover a different signature', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120002_unsafe_overload.sql',
        sql: `
          CREATE OR REPLACE FUNCTION public.is_show_secretary(p_role text)
          RETURNS boolean
          LANGUAGE sql
          AS $$ SELECT false $$;
          REVOKE EXECUTE ON FUNCTION public.is_show_secretary(text) FROM authenticated;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120002_unsafe_overload.sql: public.is_show_secretary(text) has no anon EXECUTE decision',
    ]);
  });

  it('rejects a new public table without an explicit anon grant decision', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120003_unsafe_table.sql',
        sql: `
          CREATE TABLE public.unsafe_events (
            id uuid PRIMARY KEY
          );
          ALTER TABLE public.unsafe_events ENABLE ROW LEVEL SECURITY;
          REVOKE ALL ON TABLE public.unsafe_events FROM authenticated;
          CREATE POLICY unsafe_events_read ON public.unsafe_events
            FOR SELECT TO authenticated USING (true);
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120003_unsafe_table.sql: public.unsafe_events has no anon table decision',
    ]);
  });

  it('rejects an RLS table with no policy or documented deny-all disposition', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120004_undispositioned_deny_all.sql',
        sql: `
          CREATE TABLE public.undispositioned_events (id uuid PRIMARY KEY);
          ALTER TABLE public.undispositioned_events ENABLE ROW LEVEL SECURITY;
          REVOKE ALL ON TABLE public.undispositioned_events FROM anon, authenticated;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120004_undispositioned_deny_all.sql: public.undispositioned_events enables RLS with no policy or deny-all disposition',
    ]);
  });

  it('requires a decision for each function overload', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120005_overloads.sql',
        sql: `
          CREATE FUNCTION public.overloaded_probe(p_id uuid)
          RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
          CREATE FUNCTION public.overloaded_probe(p_name text)
          RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
          REVOKE EXECUTE ON FUNCTION public.overloaded_probe(uuid) FROM PUBLIC, anon, authenticated;
          REVOKE EXECUTE ON FUNCTION public.overloaded_probe(text) FROM authenticated;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120005_overloads.sql: public.overloaded_probe(text) has no anon EXECUTE decision',
    ]);
  });

  it('rejects a function with no authenticated execute decision', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120006_missing_authenticated.sql',
        sql: `
          CREATE FUNCTION public.auth_decision_probe()
          RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
          REVOKE EXECUTE ON FUNCTION public.auth_decision_probe() FROM PUBLIC, anon;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120006_missing_authenticated.sql: public.auth_decision_probe() has no authenticated EXECUTE decision',
    ]);
  });

  it('accepts explicit function and table decisions', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120007_explicit_decisions.sql',
        sql: `
          CREATE FUNCTION public.safe_probe(p_id uuid)
          RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
          REVOKE ALL ON FUNCTION public.safe_probe(uuid) FROM PUBLIC, anon;
          GRANT EXECUTE ON FUNCTION public.safe_probe(uuid) TO authenticated;

          CREATE TABLE public.safe_events (id uuid PRIMARY KEY);
          REVOKE ALL ON TABLE public.safe_events FROM anon, authenticated;
        `,
      },
    ]);

    expect(violations).toEqual([]);
  });

  it('keeps the applied migration corpus free of undecided public objects', () => {
    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter(filename => filename.endsWith('.sql'))
      .sort()
      .map(filename => ({
        filename,
        sql: readFileSync(resolve(MIGRATIONS_DIR, filename), 'utf8'),
      }));

    expect(findUndecidedPublicObjects(migrations)).toEqual([]);
  });
});
