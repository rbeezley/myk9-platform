import type { CheckInStatus } from '@myk9/core';
import type { Database } from '@/types/supabase';

/**
 * Database row type from Supabase schema.
 */

/**
 * Reads a column that may not exist on the generated row type yet (a migration
 * that has not been applied, or types not regenerated since). Returns undefined
 * rather than throwing so a pre-migration database still maps cleanly.
 */
function optionalColumn(row: unknown, column: string): string | undefined {
  const value = (row as Record<string, unknown>)[column];
  return typeof value === 'string' ? value : undefined;
}

export type EntryRow = Database['public']['Tables']['entries']['Row'];

/**
 * App-level Entry type with camelCase fields and sync metadata.
 */
export interface ReplicatedEntry {
  id: string;
  classId?: string | undefined;
  showId?: string | undefined;
  dogId?: string | undefined;
  handlerId?: string | undefined;
  armband?: string | undefined;
  handler?: string | undefined;
  status?: string | undefined;
  entryStatus?: string | undefined;

  // Check-in status (show-day flow, separate from entry_status lifecycle)
  checkInStatus?: CheckInStatus | undefined;
  check_in_status?: CheckInStatus | undefined; // snake_case alias for Supabase compatibility

  jumpHeight?: string | undefined;
  entryFee?: number | undefined;
  totalFees?: number | undefined;
  paymentStatus?: string | undefined;
  paymentMethod?: string | undefined;
  entrySource?: string | undefined;
  capacityOverride?: boolean | undefined;
  capacity_override?: boolean | undefined;
  isDayOfShow?: boolean | undefined;
  isInRing?: boolean | undefined;
  is_in_ring?: boolean | undefined;
  runOrder?: number | undefined;
  moveUpRequested?: boolean | undefined;
  move_up_requested?: boolean | undefined;
  preferredJudge?: string | undefined;
  specialRequests?: string | null | undefined;
  special_requests?: string | null | undefined;
  /** Secretary payment bookkeeping (20260828200000). */
  paymentReference?: string | null | undefined;
  payment_reference?: string | null | undefined;
  paymentReceivedOn?: string | null | undefined;
  payment_received_on?: string | null | undefined;
  paymentNotes?: string | null | undefined;
  payment_notes?: string | null | undefined;
  withdrawalReason?: string | null | undefined;
  withdrawal_reason?: string | null | undefined;
  submittedAt?: string | undefined;
  registrationId?: string | undefined;
  trialId?: string | undefined;
  trial_id?: string | undefined;

  // Payment/refund metadata
  discountAmount?: number | undefined;
  discount_amount?: number | undefined;
  comped?: boolean | undefined;
  compedReason?: string | null | undefined;
  comped_reason?: string | null | undefined;
  refundAmount?: number | undefined;
  refund_amount?: number | undefined;
  refundedAt?: string | undefined;
  refunded_at?: string | undefined;
  stripePaymentIntentId?: string | undefined;
  stripe_payment_intent_id?: string | undefined;

  // Extra fields for scoring/display (camelCase)
  isScored?: boolean | undefined;
  resultStatus?: string | undefined;
  resultText?: string | undefined;
  searchTimeSeconds?: number | undefined;
  totalScore?: number | undefined;
  totalPoints?: number | undefined;
  finalPlacement?: string | null | undefined;
  dogCallName?: string | undefined;
  dogBreed?: string | undefined;
  handlerName?: string | undefined;
  armbandNumber?: string | undefined;

  disqualification_reason?: string | null | undefined;
  totalFaults?: number | undefined;
  judgeNotes?: string | null | undefined;
  scoringCompletedAt?: string | null | undefined;

  // Extra fields for scoring/display (snake_case for Compatibility)
  is_scored?: boolean | undefined;
  result_status?: string | undefined;
  result_text?: string | undefined;
  search_time_seconds?: number | undefined;
  total_score?: number | undefined;
  total_points?: number | undefined;
  final_placement?: string | undefined;
  dog_call_name?: string | undefined;
  dog_breed?: string | undefined;
  handler_name?: string | undefined;
  armband_number?: string | undefined;
  total_faults?: number | undefined;
  judge_notes?: string | null | undefined;
  scoring_completed_at?: string | null | undefined;

  // Detailed scent-work scoring (snake_case; ringside-RPC whitelisted). Persisted
  // so multi-area detail survives device loss and reaches the secretary/reports
  // instead of living only in the local scoring session.
  area1_time_seconds?: number | null | undefined;
  area2_time_seconds?: number | null | undefined;
  area3_time_seconds?: number | null | undefined;
  area4_time_seconds?: number | null | undefined;
  total_correct_finds?: number | null | undefined;
  total_incorrect_finds?: number | null | undefined;
  no_finish_count?: number | null | undefined;
  points_earned?: number | null | undefined;

  class_id?: string | undefined;
  entry_status?: string | undefined;
  element?: string | undefined;
  level?: string | undefined;
  areas?: number | undefined;
  timeLimit?: string | undefined;
  timeLimit2?: string | undefined;
  timeLimit3?: string | undefined;

  // Ring timing (show-day flow)
  ring_entry_time?: string | undefined;
  ring_exit_time?: string | undefined;

  // Timestamps
  createdAt?: string | undefined;
  created_at?: string | undefined;
  updated_at?: string | undefined;
  deletedAt?: string | null | undefined;
  deleted_at?: string | null | undefined;

  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

/**
 * Convert an app-level entry to a Supabase row, omitting app-only fields.
 */
export function entryToSupabaseRow(entry: ReplicatedEntry): Record<string, unknown> {
  // Coerce empty strings to null for UUID FK columns (Postgres rejects '' as invalid UUID)
  const fk = (v: string | undefined): string | null => v || null;

  return {
    id: entry.id,
    class_id: fk(entry.classId),
    show_id: fk(entry.showId),
    dog_id: fk(entry.dogId),
    handler_id: fk(entry.handlerId),
    armband: entry.armband ?? null,
    handler: entry.handler ?? null,
    entry_status: entry.entryStatus ?? null,
    check_in_status: entry.checkInStatus ?? entry.check_in_status ?? 'no-status',
    jump_height: entry.jumpHeight ?? null,
    entry_fee: entry.entryFee ?? null,
    payment_status: entry.paymentStatus ?? null,
    payment_method: entry.paymentMethod ?? null,
    entry_source: entry.entrySource ?? 'myk9',
    capacity_override: entry.capacityOverride ?? entry.capacity_override ?? false,
    is_day_of_show: entry.isDayOfShow ?? null,
    run_order: entry.runOrder ?? null,
    move_up_requested: entry.moveUpRequested ?? entry.move_up_requested ?? null,
    preferred_judge: entry.preferredJudge ?? null,
    special_requests:
      entry.specialRequests !== undefined
        ? entry.specialRequests
        : entry.special_requests !== undefined
          ? entry.special_requests
          : null,
    payment_reference:
      entry.paymentReference !== undefined ? entry.paymentReference : entry.payment_reference,
    payment_received_on:
      entry.paymentReceivedOn !== undefined ? entry.paymentReceivedOn : entry.payment_received_on,
    payment_notes: entry.paymentNotes !== undefined ? entry.paymentNotes : entry.payment_notes,    withdrawal_reason:
      entry.withdrawalReason !== undefined
        ? entry.withdrawalReason
        : entry.withdrawal_reason !== undefined
          ? entry.withdrawal_reason
          : null,
    submitted_at: entry.submittedAt ?? null,
    registration_id: fk(entry.registrationId),
    trial_id: fk(entry.trialId ?? entry.trial_id),
    is_scored: entry.isScored ?? entry.is_scored ?? null,
    result_status: entry.resultStatus ?? entry.result_status ?? null,
    disqualification_reason: entry.disqualification_reason ?? null,
    search_time_seconds: entry.searchTimeSeconds ?? entry.search_time_seconds ?? null,
    total_score:
      entry.totalScore ?? entry.total_score ?? entry.totalPoints ?? entry.total_points ?? null,
    total_faults: entry.totalFaults ?? entry.total_faults ?? null,
    judge_notes: entry.judgeNotes ?? entry.judge_notes ?? null,
    scoring_completed_at: entry.scoringCompletedAt ?? entry.scoring_completed_at ?? null,
    // Detailed scent-work scoring (ringside-RPC whitelisted). Include a column
    // ONLY when the local row actually has it (`!== undefined`), NOT `?? null`.
    // An entry replica cached before these fields were mapped lacks them; a
    // full-row direct UPDATE (e.g. a manager editing a non-ringside column)
    // would otherwise serialize them as null and wipe already-saved area
    // times/counts/points on the server. Omitting an unset column leaves the
    // server value untouched; an explicit null (a real clear) is still written.
    ...(entry.area1_time_seconds !== undefined && {
      area1_time_seconds: entry.area1_time_seconds,
    }),
    ...(entry.area2_time_seconds !== undefined && {
      area2_time_seconds: entry.area2_time_seconds,
    }),
    ...(entry.area3_time_seconds !== undefined && {
      area3_time_seconds: entry.area3_time_seconds,
    }),
    ...(entry.area4_time_seconds !== undefined && {
      area4_time_seconds: entry.area4_time_seconds,
    }),
    ...(entry.total_correct_finds !== undefined && {
      total_correct_finds: entry.total_correct_finds,
    }),
    ...(entry.total_incorrect_finds !== undefined && {
      total_incorrect_finds: entry.total_incorrect_finds,
    }),
    ...(entry.no_finish_count !== undefined && { no_finish_count: entry.no_finish_count }),
    ...(entry.points_earned !== undefined && { points_earned: entry.points_earned }),
    // Only write placement if result is qualified — NQ/absent/etc. should never have a placement
    final_placement:
      entry.resultStatus && entry.resultStatus !== 'qualified'
        ? null
        : entry.finalPlacement != null
          ? Number(entry.finalPlacement)
          : entry.final_placement != null
            ? Number(entry.final_placement)
            : null,
    ring_entry_time: entry.ring_entry_time ?? null,
    ring_exit_time: entry.ring_exit_time ?? null,
    deleted_at:
      entry.deletedAt !== undefined
        ? entry.deletedAt
        : entry.deleted_at !== undefined
          ? entry.deleted_at
          : null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Convert database row to app Entry type.
 *
 * Exported for unit testing the field mapping (notably the embedded
 * `dogs(call_name, breed)` -> `dogCallName` / `dogBreed` denormalization).
 */
export function rowToEntry(row: EntryRow): ReplicatedEntry {
  const dbRow = row as EntryRow & Record<string, unknown>;
  const dog = dbRow.dogs as { call_name?: string | null; breed?: string | null } | null | undefined;

  return {
    id: String(row.id),
    classId: row.class_id ?? undefined,
    showId: row.show_id ?? undefined,
    dogId: row.dog_id ?? undefined,
    handlerId: row.handler_id ?? undefined,
    armband: row.armband ?? undefined,
    handler: row.handler ?? undefined,
    status: (dbRow.status as string | undefined) ?? undefined,
    entryStatus: row.entry_status ?? undefined,
    checkInStatus: (dbRow.check_in_status as CheckInStatus) ?? 'no-status',
    check_in_status: (dbRow.check_in_status as CheckInStatus) ?? 'no-status',
    jumpHeight: row.jump_height ?? undefined,
    entryFee: row.entry_fee ?? undefined,
    totalFees: (dbRow.total_fees as number | undefined) ?? undefined,
    paymentStatus: row.payment_status ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    discountAmount: row.discount_amount ?? undefined,
    discount_amount: row.discount_amount ?? undefined,
    comped: row.comped ?? undefined,
    compedReason: row.comped_reason ?? undefined,
    comped_reason: row.comped_reason ?? undefined,
    entrySource: (dbRow.entry_source as string | undefined) ?? undefined,
    capacityOverride: (dbRow.capacity_override as boolean | undefined) ?? false,
    capacity_override: (dbRow.capacity_override as boolean | undefined) ?? false,
    isDayOfShow: row.is_day_of_show ?? undefined,
    isInRing: row.is_in_ring ?? undefined,
    is_in_ring: row.is_in_ring ?? undefined,
    runOrder: row.run_order ?? undefined,
    moveUpRequested: row.move_up_requested ?? undefined,
    move_up_requested: row.move_up_requested ?? undefined,
    preferredJudge: row.preferred_judge ?? undefined,
    specialRequests: row.special_requests ?? undefined,
    // Generated Database types will carry these once migration 20260828200000 is
    // applied and `generate_typescript_types` is re-run; until then the row type
    // cannot know them, so read them defensively rather than assert the shape.
    paymentReference: optionalColumn(row, 'payment_reference'),
    paymentReceivedOn: optionalColumn(row, 'payment_received_on'),
    paymentNotes: optionalColumn(row, 'payment_notes'),
    special_requests: row.special_requests ?? undefined,
    withdrawalReason: row.withdrawal_reason ?? undefined,
    withdrawal_reason: row.withdrawal_reason ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    registrationId: row.registration_id ?? undefined,
    trialId: row.trial_id ?? undefined,
    trial_id: row.trial_id ?? undefined,
    refundAmount: row.refund_amount ?? undefined,
    refund_amount: row.refund_amount ?? undefined,
    refundedAt: row.refunded_at ?? undefined,
    refunded_at: row.refunded_at ?? undefined,
    stripePaymentIntentId: row.stripe_payment_intent_id ?? undefined,
    stripe_payment_intent_id: row.stripe_payment_intent_id ?? undefined,

    // CamelCase fields
    disqualification_reason: (dbRow.disqualification_reason as string | undefined) ?? undefined,
    totalFaults: (dbRow.total_faults as number | undefined) ?? undefined,
    judgeNotes: (dbRow.judge_notes as string | undefined) ?? undefined,
    scoringCompletedAt: (dbRow.scoring_completed_at as string | undefined) ?? undefined,
    isScored: (dbRow.is_scored as boolean | undefined) ?? false,
    resultStatus: (dbRow.result_status as string | undefined) ?? undefined,
    resultText: (dbRow.result_text as string | undefined) ?? undefined,
    searchTimeSeconds: (dbRow.search_time_seconds as number | undefined) ?? undefined,
    totalScore: (dbRow.total_score as number | undefined) ?? undefined,
    totalPoints:
      (dbRow.total_score as number | undefined) ??
      (dbRow.total_points as number | undefined) ??
      undefined,
    finalPlacement: dbRow.final_placement != null ? String(dbRow.final_placement) : undefined,
    dogCallName: dog?.call_name ?? (dbRow.dog_call_name as string | undefined) ?? undefined,
    dogBreed: dog?.breed ?? (dbRow.dog_breed as string | undefined) ?? undefined,
    handlerName: row.handler ?? undefined,
    armbandNumber: row.armband ?? undefined,

    // Snake_case fields (compatibility)
    is_scored: (dbRow.is_scored as boolean | undefined) ?? false,
    result_status: (dbRow.result_status as string | undefined) ?? undefined,
    result_text: (dbRow.result_text as string | undefined) ?? undefined,
    search_time_seconds: (dbRow.search_time_seconds as number | undefined) ?? undefined,
    total_score: (dbRow.total_score as number | undefined) ?? undefined,
    total_points:
      (dbRow.total_score as number | undefined) ??
      (dbRow.total_points as number | undefined) ??
      undefined,
    final_placement: dbRow.final_placement != null ? String(dbRow.final_placement) : undefined,
    dog_call_name: dog?.call_name ?? (dbRow.dog_call_name as string | undefined) ?? undefined,
    dog_breed: dog?.breed ?? (dbRow.dog_breed as string | undefined) ?? undefined,
    handler_name: row.handler ?? undefined,
    armband_number: row.armband ?? undefined,
    total_faults: (dbRow.total_faults as number | undefined) ?? undefined,
    judge_notes: (dbRow.judge_notes as string | undefined) ?? undefined,
    scoring_completed_at: (dbRow.scoring_completed_at as string | undefined) ?? undefined,
    // Detailed scent-work scoring — read back so a full-row direct UPDATE
    // doesn't null out server values it didn't intend to change.
    area1_time_seconds: (dbRow.area1_time_seconds as number | undefined) ?? undefined,
    area2_time_seconds: (dbRow.area2_time_seconds as number | undefined) ?? undefined,
    area3_time_seconds: (dbRow.area3_time_seconds as number | undefined) ?? undefined,
    area4_time_seconds: (dbRow.area4_time_seconds as number | undefined) ?? undefined,
    total_correct_finds: (dbRow.total_correct_finds as number | undefined) ?? undefined,
    total_incorrect_finds: (dbRow.total_incorrect_finds as number | undefined) ?? undefined,
    no_finish_count: (dbRow.no_finish_count as number | undefined) ?? undefined,
    points_earned: (dbRow.points_earned as number | undefined) ?? undefined,
    class_id: row.class_id ?? undefined,
    entry_status: row.entry_status ?? undefined,
    element: (dbRow.element as string | undefined) ?? undefined,
    level: (dbRow.level as string | undefined) ?? undefined,
    areas: (dbRow.area_count as number | undefined) ?? undefined,
    timeLimit: dbRow.time_limit_seconds ? String(dbRow.time_limit_seconds as number) : undefined,
    timeLimit2: dbRow.time_limit_area2_seconds
      ? String(dbRow.time_limit_area2_seconds as number)
      : undefined,
    timeLimit3: dbRow.time_limit_area3_seconds
      ? String(dbRow.time_limit_area3_seconds as number)
      : undefined,

    // Ring timing
    ring_entry_time: row.ring_entry_time ?? undefined,
    ring_exit_time: row.ring_exit_time ?? undefined,

    // Timestamps
    createdAt: row.created_at ?? undefined,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    deleted_at: row.deleted_at ?? undefined,
  };
}
