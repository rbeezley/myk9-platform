/**
 * Hand-maintained corrections to the GENERATED Supabase types (MYK9-583).
 *
 * `supabase gen types` builds `Args` from `pg_proc`, and `pg_proc` does not
 * record argument NULLABILITY — every scalar argument comes out non-null. When
 * a function's contract gives NULL its own meaning, the generated type is
 * simply wrong, and the only honest fix on the client side is to widen it here.
 *
 * WHY HERE AND NOT IN THE GENERATED FILE. `scripts/qa/supabase-types-drift.sh`
 * diffs `packages/supabase/src/types/database.types.ts` against a fresh
 * regeneration; an edit there would show up as drift on every run and be
 * overwritten by the next regeneration. This overlay is applied on top instead,
 * so regenerating the package file keeps the correction.
 *
 * CONSUMING IT. App code must import `Database` from `@/types/supabase`, which
 * re-exports the overlaid type. A direct `import type { Database } from
 * '@myk9/supabase'` inside `apps/myk9show` bypasses this file and sees the
 * un-widened generated type — it will compile, and then reject the very NULL the
 * server expects. (Two direct imports exist today, `store/cartStore.types.ts:7`
 * and `test/database/classesJudgeNameRetired.source.test.ts:5`; both use only
 * `Tables<…>` off it, which no correction touches, so they are harmless.)
 *
 * ADDING ONE. Widen only the specific field whose real contract the generator
 * cannot see, never a whole `Args`, and say in a comment what NULL MEANS in the
 * SQL and which migration establishes it. A widening is safe for existing
 * callers (it only ever accepts more), but it is a claim about the server, so
 * it must be read off the migration, not assumed.
 */
import type { Database as GeneratedDatabase } from '@myk9/supabase';

type GeneratedPublic = GeneratedDatabase['public'];
type GeneratedFunctions = GeneratedPublic['Functions'];

/** Replace one `Args` field of a generated function type, keeping `Returns`. */
type WithArg<Fn extends { Args: object }, K extends keyof Fn['Args'], T> = Omit<Fn, 'Args'> & {
  Args: Omit<Fn['Args'], K> & { [P in K]: T };
};

/**
 * `withdraw_own_entry(p_entry_id uuid, p_fields jsonb, p_expected_version integer)`
 *
 * A NULL `p_expected_version` means "skip the optimistic-concurrency check" —
 * `supabase/migrations/20260915203300_withdraw_own_entry_rpc.sql` guards both
 * the 40001 raise (`IF p_expected_version IS NOT NULL AND …`) and the UPDATE's
 * WHERE (`p_expected_version IS NULL OR e.version = …`) on it. The client sends
 * NULL for a row it has no OCC token for.
 *
 * `p_expected_version ?? 0` is NOT a substitute: 0 is a valid version. Entries
 * default to `version = 1` and would conflict, burning the single retry the
 * withdrawal path has.
 */
type WithdrawOwnEntry = WithArg<
  GeneratedFunctions['withdraw_own_entry'],
  'p_expected_version',
  number | null
>;

/** The generated `Database` with the corrections above applied. */
export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedPublic, 'Functions'> & {
    Functions: Omit<GeneratedFunctions, 'withdraw_own_entry'> & {
      withdraw_own_entry: WithdrawOwnEntry;
    };
  };
};
