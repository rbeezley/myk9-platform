import { createDatabaseError, logQuery, supabase } from '../supabaseClient';

export interface SecretaryPullMetadata {
  id: string;
  withdrawn_at: string | null;
  refund_decision: string | null;
  refund_decided_at: string | null;
}

const SECRETARY_ENTRIES_SELECT = `
        id,
        dog_id,
        class_id,
        trial_id,
        show_id,
        handler,
        handler_id,
        payment_status,
        entry_status,
        entry_fee,
        submitted_at,
        created_at,
        updated_at,
        armband,
        special_requests,
        jump_height,
        run_order,
        is_in_ring,
        is_scored,
        result_status,
        search_time_seconds,
        total_faults,
        final_placement,
        judge_notes,
        disqualification_reason,
        scoring_completed_at,
        check_in_status,
        withdrawal_reason,
        withdrawn_at,
        payment_method,
        refund_amount,
        refunded_at,
        stripe_payment_intent_id,
        refund_decision,
        refund_decided_at,
        registration_id,
        handler_person:handler_id (
          id,
          first_name,
          last_name,
          auth_user_id
        ),
        registration:registration_id (
          id,
          confirmation_number,
          payment_status,
          payment_reference,
          total_amount,
          paid_amount,
          refund_amount,
          refund_notes,
          refunded_at
        ),
        trial:trial_id (
          trial_type,
          timezone
        ),
        dog:dog_id (
          id,
          name,
          call_name,
          breed,
          owner:owner_id (
            id,
            first_name,
            last_name,
            email,
            auth_user_id
          )
        ),
        class:class_id (
          id,
          name,
          class_number,
          max_entries
        )
      `;

export async function postgrestGetSecretaryEntriesForShow(
  showId: string,
  startTime: number,
  operation: string
) {
  const { data, error } = await supabase
    .from('entries')
    .select(SECRETARY_ENTRIES_SELECT)
    .eq('show_id', showId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  const duration = Date.now() - startTime;
  logQuery('entries', operation, duration, error?.message);

  if (error) {
    throw createDatabaseError(error, 'entries', operation);
  }

  return { data: data || [], error: null };
}

/** Online-only reconciliation metadata layered over the offline entry replica. */
export async function postgrestGetSecretaryPullMetadataMap(
  showId: string
): Promise<Map<string, SecretaryPullMetadata>> {
  const { data, error } = await supabase
    .from('entries')
    .select('id, withdrawn_at, refund_decision, refund_decided_at')
    .eq('show_id', showId)
    .eq('entry_status', 'scratched');

  if (error) {
    throw createDatabaseError(error, 'entries', 'get_secretary_pull_metadata');
  }

  return new Map((data ?? []).map(metadata => [metadata.id, metadata]));
}
