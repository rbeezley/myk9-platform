import { createDatabaseError, logQuery, supabase } from '../supabaseClient';

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
        check_in_status,
        withdrawal_reason,
        payment_method,
        refund_amount,
        refunded_at,
        stripe_payment_intent_id,
        registration_id,
        handler_person:handler_id (
          id,
          first_name,
          last_name
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
        dog:dog_id (
          id,
          name,
          call_name,
          breed,
          owner:owner_id (
            id,
            first_name,
            last_name,
            email
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
