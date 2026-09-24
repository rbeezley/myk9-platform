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
 * The same, for an `Args` field the generator already made OPTIONAL (a SQL
 * `DEFAULT`). `WithArg` would re-declare it as required, which narrows the
 * type for callers that omit it; this keeps the `?`.
 */
type WithOptionalArg<Fn extends { Args: object }, K extends keyof Fn['Args'], T> = Omit<
  Fn,
  'Args'
> & {
  Args: Omit<Fn['Args'], K> & { [P in K]?: T };
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
 * `update_own_entry_jump_height(p_entry_id uuid, p_jump_height text,
 * p_expected_version integer)` —
 * `supabase/migrations/20260916194700_update_own_entry_jump_height_rpc.sql`.
 *
 * Same NULL contract as `withdraw_own_entry`: the 40001 raise is guarded by
 * `IF p_expected_version IS NOT NULL AND …` and the UPDATE's WHERE by
 * `p_expected_version IS NULL OR e.version = …`. The client sends NULL only
 * when the row's version cannot be read; never `?? 0`, which is a real version.
 */
type UpdateOwnEntryJumpHeight = WithArg<
  GeneratedFunctions['update_own_entry_jump_height'],
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
 * `move_up_entry(p_entry_id uuid, p_target_class_id uuid, p_new_entry_id uuid,
 * p_reason text DEFAULT NULL)` —
 * `supabase/migrations/20260918193300_myk9_639_move_up_supersession.sql`.
 *
 * The migration declares the argument `text DEFAULT NULL`, and a NULL means
 * "no reason given": the note the function records is built with
 * `COALESCE(': ' || NULLIF(btrim(p_reason), ''), '')`, so NULL and an empty
 * string both yield a bare "Moved up from class …". `pg_proc` records the
 * DEFAULT but not the nullability, so the generated `p_reason?: string`
 * rejects the explicit NULL the client sends when the secretary left the
 * reason box empty.
 */
type MoveUpEntry = WithOptionalArg<GeneratedFunctions['move_up_entry'], 'p_reason', string | null>;

/** `20260920130937` adds the authorized, version-returning show style command. */
type UpdateShowStyle = {
  Args: { p_show_id: string; p_style: string };
  Returns: number;
};

/**
 * Club membership requests (MYK9-685) —
 * `supabase/migrations/20260924153700_myk9_685_club_membership_requests.sql`.
 * Hand-declared until the next `supabase gen types` picks them up, the same way
 * `update_show_style` is. NULL `p_requester_note` / `p_note` mean "no note"
 * (the SQL stores `NULLIF(btrim(...), '')`); `list_club_membership_requests`
 * returns only pending rows, and `requester_email` is `people.email`, which is
 * nullable. `get_my_club_membership_request_status` returns exactly one row:
 * one `state`, and a `reviewer_note` only for 'denied'.
 */
type ClubMembershipRequestFunctions = {
  submit_club_membership_request: {
    Args: { p_club_id: string; p_requester_note?: string | null };
    Returns: string | null;
  };
  get_my_club_membership_request_status: {
    Args: { p_club_id: string };
    Returns: {
      state: 'member' | 'suspended' | 'pending' | 'denied' | 'none';
      reviewer_note: string | null;
    }[];
  };
  list_club_membership_requests: {
    Args: { p_club_id: string };
    Returns: {
      id: string;
      club_id: string;
      person_id: string;
      status: string;
      requester_note: string | null;
      created_at: string;
      requester_name: string;
      requester_email: string | null;
    }[];
  };
  approve_club_membership_request: {
    Args: { p_request_id: string; p_note?: string | null };
    Returns: undefined;
  };
  deny_club_membership_request: {
    Args: { p_request_id: string; p_note?: string | null };
    Returns: undefined;
  };
};

/** The generated `Database` with the corrections above applied. */
export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedPublic, 'Functions'> & {
    Functions: Omit<
      GeneratedFunctions,
      | 'withdraw_own_entry'
      | 'update_own_entry_jump_height'
      | 'list_club_role_requests'
      | 'move_up_entry'
    > & {
      withdraw_own_entry: WithdrawOwnEntry;
      update_own_entry_jump_height: UpdateOwnEntryJumpHeight;
      list_club_role_requests: ListClubRoleRequests;
      move_up_entry: MoveUpEntry;
      update_show_style: UpdateShowStyle;
    } & ClubMembershipRequestFunctions;
  };
};
