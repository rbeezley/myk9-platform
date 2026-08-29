export interface SecretaryEntry {
  id: string;
  dog_id: string | null;
  class_id: string | null;
  trial_id: string | null;
  show_id: string | null;
  handler: string | null;
  handler_id: string | null;
  payment_status: string | null;
  entry_status: string | null;
  entry_fee: number | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  armband: string | null;
  special_requests: string | null;
  jump_height: string | null;
  run_order: number | null;
  is_in_ring: boolean | null;
  is_scored: boolean | null;
  result_status: string | null;
  search_time_seconds: number | null;
  total_faults: number | null;
  final_placement: number | null;
  judge_notes: string | null;
  disqualification_reason: string | null;
  scoring_completed_at: string | null;
  check_in_status: string | null;
  withdrawal_reason: string | null;
  withdrawn_at?: string | null;
  payment_method: string | null;
  refund_amount: number | null;
  refunded_at: string | null;
  stripe_payment_intent_id: string | null;
  /**
   * Comp state is a real, persisted column, and both read paths already select
   * it -- but SecretaryEntry did not carry it, so the mapper could not set it
   * and `comped` was only ever written by the local optimistic patch. Any
   * reload dropped the Comped badge and offered "Comp" again for an entry that
   * was already comped, inviting a duplicate; `comped_reason` was unrecoverable.
   */
  comped?: boolean | null;
  comped_reason?: string | null;
  refund_decision?: string | null;
  refund_decided_at?: string | null;
  /**
   * Secretary payment bookkeeping (20260828200000). Optional because the read
   * degrades to the pre-migration column set -- see
   * `isSecretaryPaymentSchemaUnavailable`.
   */
  payment_reference?: string | null;
  payment_received_on?: string | null;
  payment_notes?: string | null;
  registration_id: string | null;
  registration: {
    id: string;
    confirmation_number: string;
    payment_status: string | null;
    payment_reference: string | null;
    total_amount: number | null;
    paid_amount: number | null;
    refund_amount: number | null;
    refund_notes: string | null;
    refunded_at: string | null;
  } | null;
  trial: {
    trial_type: string | null;
    timezone?: string | null;
  } | null;
  /** Joined person for handler_id — online entries set the FK, not the legacy text. */
  handler_person: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    auth_user_id: string | null;
  } | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
    breed: string | null;
    owner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      auth_user_id: string | null;
    } | null;
  } | null;
  class: {
    id: string;
    name: string;
    class_number: string | null;
    max_entries: number | null;
  } | null;
}

export interface PendingEntry {
  id: string;
  showId: string;
  showName: string;
  className: string;
  handlerName: string;
  dogName: string;
  submittedAt: string;
  /** Raw entry_status — consumed by getEntryAttention() for unified classification. */
  entry_status: string | null;
  /** Raw check_in_status — consumed by getEntryAttention() for unified classification. */
  check_in_status: string | null;
}

export interface SecretaryStatusEntrySeed {
  id?: string;
  showId?: string;
  classId?: string;
  dogId?: string;
  handler?: string;
  handlerId?: string;
  armband?: string;
  registrationId?: string;
  trialId?: string;
  entryStatus?: string;
  paymentStatus?: string;
}
