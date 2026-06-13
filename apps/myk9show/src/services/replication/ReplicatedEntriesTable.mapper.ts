import type { CheckInStatus } from '@myk9/core';
import type { Database } from '@/types/supabase';

/**
 * Database row type from Supabase schema.
 */
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
  isDayOfShow?: boolean | undefined;
  isInRing?: boolean | undefined;
  is_in_ring?: boolean | undefined;
  runOrder?: number | undefined;
  moveUpRequested?: boolean | undefined;
  move_up_requested?: boolean | undefined;
  preferredJudge?: string | undefined;
  specialRequests?: string | null | undefined;
  special_requests?: string | null | undefined;
  withdrawalReason?: string | null | undefined;
  withdrawal_reason?: string | null | undefined;
  submittedAt?: string | undefined;
  registrationId?: string | undefined;
  trialId?: string | undefined;
  trial_id?: string | undefined;

  // Payment/refund metadata
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
  total_points?: number | undefined;
  final_placement?: string | undefined;
  dog_call_name?: string | undefined;
  dog_breed?: string | undefined;
  handler_name?: string | undefined;
  armband_number?: string | undefined;
  total_faults?: number | undefined;
  judge_notes?: string | null | undefined;
  scoring_completed_at?: string | null | undefined;
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
    entrySource: (dbRow.entry_source as string | undefined) ?? undefined,
    isDayOfShow: row.is_day_of_show ?? undefined,
    isInRing: row.is_in_ring ?? undefined,
    is_in_ring: row.is_in_ring ?? undefined,
    runOrder: row.run_order ?? undefined,
    moveUpRequested: row.move_up_requested ?? undefined,
    move_up_requested: row.move_up_requested ?? undefined,
    preferredJudge: row.preferred_judge ?? undefined,
    specialRequests: row.special_requests ?? undefined,
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
    totalPoints: (dbRow.total_points as number | undefined) ?? undefined,
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
    total_points: (dbRow.total_points as number | undefined) ?? undefined,
    final_placement: dbRow.final_placement != null ? String(dbRow.final_placement) : undefined,
    dog_call_name: dog?.call_name ?? (dbRow.dog_call_name as string | undefined) ?? undefined,
    dog_breed: dog?.breed ?? (dbRow.dog_breed as string | undefined) ?? undefined,
    handler_name: row.handler ?? undefined,
    armband_number: row.armband ?? undefined,
    total_faults: (dbRow.total_faults as number | undefined) ?? undefined,
    judge_notes: (dbRow.judge_notes as string | undefined) ?? undefined,
    scoring_completed_at: (dbRow.scoring_completed_at as string | undefined) ?? undefined,
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
