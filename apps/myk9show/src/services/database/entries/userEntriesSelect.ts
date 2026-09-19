/**
 * Select shape for the account-level own-entry read.
 *
 * The two migration-backed columns are optional because deployments can briefly
 * run the app against a database that has not received their migrations yet.
 */
export const USER_ENTRIES_SELECT = `
      id,
      dog_id,
      show_id,
      class_id,
      trial_id,
      handler,
      handler_id,
      payment_status,
      payment_method,
      moved_from_entry_id,
      entry_status,
      check_in_status,
      entry_fee,
      armband,
      run_order,
      jump_height,
      special_requests,
      is_scored,
      result_status,
      search_time_seconds,
      total_faults,
      final_placement,
      class_results_released_at,
      dog_image_url,
      deleted_at,
      refund_amount,
      refunded_at,
      submitted_at,
      created_at,
      updated_at,
      registration_id,
      registration:registration_id (
        id,
        confirmation_number,
        payment_status,
        payment_reference,
        paid_amount
      ),
      dog:dog_id (
        id,
        name,
        call_name,
        breed
      ),
      show:show_id (
        id,
        name,
        deleted_at,
        status,
        start_date,
        end_date,
        entry_close_date,
        venue_name,
        city,
        state,
        trials:trials (
          id,
          date,
          timezone
        )
      ),
      class:class_id (
        id,
        name,
        class_number,
        trial:trial_id (
          id,
          trial_type,
          date,
          trial_number,
          timezone
        )
      ),
      trial:trial_id (
        id,
        trial_type,
        date,
        trial_number,
        timezone
      )
    `;

/**
 * Add the migration-backed view columns that are known to exist on the server.
 * Each optional column is dropped independently when its migration is absent,
 * because a missing PostgREST column rejects the whole select.
 */
export function buildUserEntriesSelect(options: {
  includeReasonCode: boolean;
  includeRegistrationConfirmationNumber: boolean;
  includeMoveUpLink?: boolean;
}): string {
  const baseSelect =
    options.includeMoveUpLink === false
      ? USER_ENTRIES_SELECT.replace(/,\s*moved_from_entry_id/, '')
      : USER_ENTRIES_SELECT;
  const optional = [
    options.includeReasonCode ? 'withdrawal_reason_code' : null,
    options.includeRegistrationConfirmationNumber ? 'registration_confirmation_number' : null,
  ].filter((column): column is string => column !== null);
  if (optional.length === 0) return baseSelect;
  return `${baseSelect},\n      ${optional.join(',\n      ')}`;
}
