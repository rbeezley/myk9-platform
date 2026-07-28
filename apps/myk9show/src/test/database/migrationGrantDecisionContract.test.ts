import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findUndecidedPublicObjects } from './migrationGrantDecisionContract';

const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');

function readMigrationCorpus() {
  return readdirSync(MIGRATIONS_DIR)
    .filter(filename => filename.endsWith('.sql'))
    .sort()
    .map(filename => ({
      filename,
      sql: readFileSync(resolve(MIGRATIONS_DIR, filename), 'utf8'),
    }));
}

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

  it('rejects a standalone authenticated function grant without an anon disposition', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120008_unsafe_standalone_grant.sql',
        sql: `
          GRANT EXECUTE ON FUNCTION public.existing_probe(uuid) TO authenticated;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120008_unsafe_standalone_grant.sql: public.existing_probe(uuid) standalone authenticated grant has no anon EXECUTE decision',
    ]);
  });

  it('rejects standalone anon function grants outside the documented keep-list', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120009_unsafe_standalone_anon.sql',
        sql: `
          GRANT EXECUTE ON FUNCTION public.existing_probe(uuid) TO anon;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120009_unsafe_standalone_anon.sql: public.existing_probe(uuid) standalone anon grant is not keep-listed',
    ]);
  });

  it('requires both API-role decisions in standalone table grants', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120010_unsafe_standalone_table.sql',
        sql: `
          GRANT SELECT ON TABLE public.existing_events TO authenticated;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120010_unsafe_standalone_table.sql: public.existing_events standalone table grant has no anon decision',
    ]);
  });

  it('checks every target in a multi-function grant', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120011_unsafe_multi_function_grant.sql',
        sql: `
          GRANT EXECUTE ON FUNCTION
            public.is_site_admin(),
            public.existing_probe(uuid)
          TO anon;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120011_unsafe_multi_function_grant.sql: public.existing_probe(uuid) standalone anon grant is not keep-listed',
    ]);
  });

  it('accepts exact multi-target decisions for multiple new functions', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120012_safe_multi_function_decisions.sql',
        sql: `
          CREATE FUNCTION public.first_probe()
          RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
          CREATE FUNCTION public.second_probe(p_id uuid)
          RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
          REVOKE EXECUTE ON FUNCTION public.first_probe(), public.second_probe(uuid)
            FROM PUBLIC, anon;
          GRANT EXECUTE ON FUNCTION public.first_probe(), public.second_probe(uuid)
            TO authenticated;
        `,
      },
    ]);

    expect(violations).toEqual([]);
  });

  it('rejects signature-omitted API function grants', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120013_unsafe_signature_omitted_grant.sql',
        sql: `
          GRANT EXECUTE ON FUNCTION public.existing_probe TO anon;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120013_unsafe_signature_omitted_grant.sql: public.existing_probe signature-omitted API function grant is forbidden',
    ]);
  });

  it('applies standalone decisions to ROUTINE grant syntax', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120014_unsafe_routine_grant.sql',
        sql: `
          GRANT EXECUTE ON ROUTINE public.existing_probe(uuid) TO authenticated;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120014_unsafe_routine_grant.sql: public.existing_probe(uuid) standalone authenticated grant has no anon EXECUTE decision',
    ]);
  });

  it('checks every target in a multi-table grant', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120012_unsafe_multi_table_grant.sql',
        sql: `
          GRANT SELECT ON TABLE public.existing_events, public.existing_people TO anon;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120012_unsafe_multi_table_grant.sql: public.existing_events standalone table grant has no authenticated decision',
      '20260728120012_unsafe_multi_table_grant.sql: public.existing_people standalone table grant has no authenticated decision',
    ]);
  });

  it('rejects API grants in public default privileges', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120009_unsafe_default_grants.sql',
        sql: `
          ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
            GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
          ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
            GRANT ALL ON TABLES TO PUBLIC;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120009_unsafe_default_grants.sql: public function default privileges grant API execution',
      '20260728120009_unsafe_default_grants.sql: public table default privileges grant API access',
    ]);
  });

  it('rejects bulk public function and table grants to API roles', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120011_unsafe_bulk_grants.sql',
        sql: `
          GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
          GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120011_unsafe_bulk_grants.sql: bulk public function grant exposes an API role',
      '20260728120011_unsafe_bulk_grants.sql: bulk public table grant exposes an API role',
    ]);
  });

  it('rejects default and bulk ROUTINE grants to API roles', () => {
    const violations = findUndecidedPublicObjects([
      {
        filename: '20260728120015_unsafe_routine_defaults.sql',
        sql: `
          ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
            GRANT EXECUTE ON ROUTINES TO authenticated;
          GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO anon;
        `,
      },
    ]);

    expect(violations).toEqual([
      '20260728120015_unsafe_routine_defaults.sql: public function default privileges grant API execution',
      '20260728120015_unsafe_routine_defaults.sql: bulk public function grant exposes an API role',
    ]);
  });

  it('rejects a backdated migration outside the frozen legacy baseline', () => {
    const violations = findUndecidedPublicObjects(
      [
        ...readMigrationCorpus(),
        {
          filename: '20260701000000_backdated_unsafe_function.sql',
          sql: `
            CREATE FUNCTION public.backdated_probe()
            RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
          `,
        },
      ],
      { validateLegacyBaseline: true }
    );

    expect(violations).toEqual([
      expect.stringContaining('legacy migration filename baseline changed'),
    ]);
  });

  it('keeps the applied migration corpus free of undecided public objects', () => {
    expect(
      findUndecidedPublicObjects(readMigrationCorpus(), { validateLegacyBaseline: true })
    ).toEqual([]);
  });
});
