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
type GeneratedTables = GeneratedPublic['Tables'];

/** Replace one `Args` field of a generated function type, keeping `Returns`. */
type WithArg<Fn extends { Args: object }, K extends keyof Fn['Args'], T> = Omit<Fn, 'Args'> & {
  Args: Omit<Fn['Args'], K> & { [P in K]: T };
};

/**
 * Replace fields of a `RETURNS TABLE` function's row shape, keeping `Args`.
 * `pg_proc` (what `supabase gen types` builds `Returns` from) has no concept
 * of a query's own WHERE/JOIN shape, so every declared output column comes
 * out non-null even when the SQL body guarantees some of them are always
 * NULL for any row the function can return.
 */
type WithReturnFields<
  Fn extends { Returns: readonly unknown[] },
  Overrides extends Partial<Record<keyof Fn['Returns'][number], unknown>>,
> = Omit<Fn, 'Returns'> & {
  Returns: (Omit<Fn['Returns'][number], keyof Overrides> & Overrides)[];
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

/**
 * `list_club_role_requests(p_club_id uuid)` —
 * `supabase/migrations/20260915231500_club_routed_role_requests.sql`.
 *
 * The RETURNS TABLE query hard-filters `rr.status = 'pending'` and
 * `rr.requested_scope = 'club'`, and reaches several columns through a
 * LEFT JOIN, so for any row this function can ever return:
 *  - `reviewed_by`, `reviewed_at`, `reviewer_note`: columns on
 *    `role_requests` itself, only ever set once a request is approved or
 *    denied — impossible while `status = 'pending'`.
 *  - `reviewer_name`, `reviewer_email`: sourced from
 *    `LEFT JOIN public.people rev ON rev.id = rr.reviewed_by` — always
 *    unmatched while `reviewed_by` is NULL.
 *  - `show_id`: `role_requests.show_id`, only ever set for a show-scoped
 *    request — excluded outright by `rr.requested_scope = 'club'`.
 *  - `club_name`: sourced from `LEFT JOIN public.clubs c ON c.id =
 *    rr.club_id` — a left join, so a request whose club has since been
 *    deleted still returns a row, with `club_name` NULL.
 *  - `requester_email`: `p.email` off the (inner-joined) requester —
 *    `people.email` is itself a nullable column, independent of the join.
 */
type ListClubRoleRequests = WithReturnFields<
  GeneratedFunctions['list_club_role_requests'],
  {
    reviewed_by: string | null;
    reviewer_name: string | null;
    reviewer_email: string | null;
    reviewed_at: string | null;
    reviewer_note: string | null;
    club_name: string | null;
    show_id: string | null;
    requester_email: string | null;
  }
>;

/**
 * `entries.moved_from_entry_id` (MYK9-639,
 * `supabase/migrations/20260918193300_myk9_639_move_up_supersession.sql`).
 *
 * A different shape of correction from the two above: the generator is not
 * WRONG here, it is simply OLDER than the schema. The column exists in the
 * migration and in both authenticated entry views, and the typed PostgREST
 * builder validates every name in a `.select()` string against these types —
 * so without this overlay, naming the column in
 * `AUTHENTICATED_ENTRY_READ_COLUMNS` makes the whole query resolve to
 * `SelectQueryError<"column 'moved_from_entry_id' does not exist on 'entries'">`
 * and the app stops compiling.
 *
 * TEMPORARY. Delete this block the moment `database.types.ts` is regenerated
 * after `supabase db push` (M2 round 2, finding 3 — the precedent is 6e7e59de5,
 * a dedicated regeneration commit after 20260918154700). Leaving it in place
 * after that is harmless but misleading: the drift check regenerates the
 * package file, and this overlay would silently shadow the real definition.
 */
type EntriesWithMoveUpLink = Omit<GeneratedTables['entries'], 'Row' | 'Insert' | 'Update'> & {
  Row: GeneratedTables['entries']['Row'] & { moved_from_entry_id: string | null };
  Insert: GeneratedTables['entries']['Insert'] & { moved_from_entry_id?: string | null };
  Update: GeneratedTables['entries']['Update'] & { moved_from_entry_id?: string | null };
};

/** The generated `Database` with the corrections above applied. */
export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedPublic, 'Functions' | 'Tables'> & {
    Tables: Omit<GeneratedTables, 'entries'> & { entries: EntriesWithMoveUpLink };
    Functions: Omit<GeneratedFunctions, 'withdraw_own_entry' | 'list_club_role_requests'> & {
      withdraw_own_entry: WithdrawOwnEntry;
      list_club_role_requests: ListClubRoleRequests;
    };
  };
};
