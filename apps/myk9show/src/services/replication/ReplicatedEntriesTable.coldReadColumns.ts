import type { Database } from '@/types/supabase';

/**
 * MYK9-1362: the explicit column lists for the single-row COLD-path reads of
 * `view_authenticated_entry_results` (the whole-entry reads use its `_replication`
 * wrapper, MYK9-1486) (an entry missing from the replica: write
 * hydration, the withdraw read, the post-withdrawal read-back, and the batched
 * remove-from-class eligibility read). The bulk sync reads
 * `*` from the replication view and is not governed here.
 */
type EntryViewColumn = keyof Database['public']['Views']['view_authenticated_entry_results']['Row'];

/**
 * Every column `rowToEntry` reads that the base view returns. ONE list so the mapper
 * and the select cannot drift: `ReplicatedEntriesTable.coldReadColumns.test.ts`
 * records every key the mapper touches and fails when one is neither here nor in
 * the two lists below. Typed against the generated view Row, so a
 * name the view lacks is a compile error rather than a PostgREST 42703 that
 * fails the whole request.
 */
export const ENTRY_VIEW_MAPPER_COLUMNS = [
  'id',
  'class_id',
  'show_id',
  'dog_id',
  'handler_id',
  'armband',
  'handler',
  'entry_status',
  'check_in_status',
  'jump_height',
  'entry_fee',
  'payment_status',
  'payment_method',
  'discount_amount',
  'comped',
  'comped_reason',
  'entry_source',
  'is_day_of_show',
  'is_in_ring',
  'run_order',
  'move_up_requested',
  'preferred_judge',
  'special_requests',
  'payment_reference',
  'payment_received_on',
  'payment_notes',
  'withdrawal_reason',
  'withdrawal_reason_code',
  'moved_from_entry_id',
  'submitted_at',
  'registration_id',
  'registration_confirmation_number',
  'results_private',
  'awaiting_registration_number',
  'placement_tie',
  'placement_tiebreak',
  'trial_id',
  'refund_amount',
  'card_paid',
  'refunded_at',
  'stripe_payment_intent_id',
  'disqualification_reason',
  'total_faults',
  'judge_notes',
  'scoring_completed_at',
  'scoring_started_at',
  'is_scored',
  'result_status',
  'result_text',
  'search_time_seconds',
  'total_score',
  'final_placement',
  'dog_call_name',
  'dog_breed',
  'area1_time_seconds',
  'area2_time_seconds',
  'area3_time_seconds',
  'area4_time_seconds',
  'total_correct_finds',
  'total_incorrect_finds',
  'no_finish_count',
  'points_earned',
  'points_possible',
  'ring_entry_time',
  'ring_exit_time',
  'created_at',
  'updated_at',
  'deleted_at',
] as const satisfies readonly EntryViewColumn[];

/**
 * MYK9-1486: the columns `rowToEntry` reads that only the REPLICATION view
 * carries: its `shows` join (`show_deleted_at`, `source_show_name`,
 * `source_show_start_date`, `source_show_end_date`). The whole-entry cold reads
 * select them from `view_authenticated_entry_results_replication`, the view the
 * bulk sync and the row-refetch adapter read, so a cold-hydrated row matches a
 * synced one. Read from the inner view they were undefined, and the post-withdrawal
 * read-back (which overwrites a CACHED row) dropped `showDeletedAt` from a synced
 * row: `userEntriesReplication` keys its soft-deleted-show fallback on it.
 * Untyped: the generated Database types do not include the replication view.
 */
export const ENTRY_REPLICATION_VIEW_COLUMNS = [
  'show_deleted_at',
  'source_show_name',
  'source_show_start_date',
  'source_show_end_date',
] as const;

/**
 * Columns `rowToEntry` reads that NEITHER view carries (checked against the
 * latest definition, 20261029043900): the mapper's `?? default` paths for them
 * are dead against the server, so a bulk-synced row holds them undefined too and
 * a cold-hydrated row differs from a synced one in nothing here. `dogs` and
 * `dog_owner_id` (so `dogOwnerId`) come from an embed or a local join, not a
 * view column; `status`, `total_fees`, `capacity_override`, `total_points`,
 * `area_count`, `element`, `level` and the three `time_limit_*` columns are
 * `entries`/`classes` columns the views never project (the views carry
 * `class_element`/`class_level`). Selecting one would 42703. Listed so the drift
 * test can tell "deliberately absent" from "forgotten".
 */
export const ENTRY_MAPPER_COLUMNS_ON_NEITHER_VIEW = [
  'dogs',
  'dog_owner_id',
  'status',
  'total_fees',
  'capacity_override',
  'total_points',
  'area_count',
  'time_limit_seconds',
  'time_limit_area2_seconds',
  'time_limit_area3_seconds',
  'element',
  'level',
] as const;

/**
 * Whole-entry cold reads (write hydration, withdraw read, post-withdrawal
 * read-back), from `view_authenticated_entry_results_replication`: the mapper's
 * columns plus the replication-only `shows` columns plus `version`, which they
 * pass on as the row's OCC precondition.
 */
export const COLD_ENTRY_ROW_SELECT = [
  ...ENTRY_VIEW_MAPPER_COLUMNS,
  ...ENTRY_REPLICATION_VIEW_COLUMNS,
  'version',
].join(',');

/**
 * Remove-from-class eligibility (batched): the only inputs of
 * `evaluateWithdrawEligibility` as projected by `withdrawEligibilityOf`, plus
 * `id` to key the answer.
 */
export const COLD_ELIGIBILITY_ROW_COLUMNS = [
  'id',
  'entry_status',
  'payment_status',
  'check_in_status',
  'is_in_ring',
  'is_scored',
  'deleted_at',
] as const satisfies readonly EntryViewColumn[];
export const COLD_ELIGIBILITY_ROW_SELECT = COLD_ELIGIBILITY_ROW_COLUMNS.join(',');
