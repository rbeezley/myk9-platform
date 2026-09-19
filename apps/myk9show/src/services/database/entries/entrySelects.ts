export const AUTHENTICATED_ENTRY_READ_COLUMNS = `
      id,
      dog_id,
      class_id,
      show_id,
      trial_id,
      handler_id,
      entry_status,
      payment_status,
      handler,
      entry_fee,
      submitted_at,
      special_requests,
      armband,
      run_order,
      jump_height,
      preferred_judge,
      move_up_requested,
      is_scored,
      is_in_ring,
      ring_entry_time,
      ring_exit_time,
      scoring_started_at,
      scoring_completed_at,
      license_key,
      local_id,
      sync_version,
      last_synced_at,
      created_at,
      updated_at,
      deleted_at,
      deleted_by,
      check_in_status,
      payment_method,
      entry_source,
      is_day_of_show,
      registration_id,
      withdrawal_reason,
      refund_amount,
      refund_notes,
      refunded_at,
      stripe_payment_intent_id,
      comped,
      comped_reason,
      discount_amount,
      promo_code_id,
      confirmation_email_sent_at,
      confirmation_email_message_id,
      confirmation_email_status,
      version
`;

/**
 * The same list PLUS MYK9-639's `moved_from_entry_id`, for the two reads whose
 * output is SUMMED as money.
 *
 * It is deliberately NOT in the shared list above, and it is written out FLAT
 * rather than composed from it. PostgREST fails the whole request with 42703 on
 * an unknown column, and migration 20260918193300 is applied by hand after the
 * merge — so naming the column in the shared list would turn every entry read
 * in the app into "Couldn't load entries" for the length of the deploy window.
 * Eighteen call sites read entries; two of them care about the link, and both
 * retry with the plain list via `isMoveUpLinkSchemaUnavailable`.
 *
 * Flat, because the typed PostgREST builder parses the select at COMPILE time
 * and nesting one interpolated constant inside another exhausts its parser,
 * degrading the whole query's type to `ParserError`. The duplication is the
 * price of the column list being type-checked at all; `moveUpLinkProjection.test.ts`
 * pins that the two lists differ by exactly this one column.
 */
export const AUTHENTICATED_ENTRY_READ_COLUMNS_WITH_MOVE_UP_LINK = `
      id,
      dog_id,
      class_id,
      show_id,
      trial_id,
      handler_id,
      entry_status,
      payment_status,
      handler,
      entry_fee,
      submitted_at,
      special_requests,
      armband,
      run_order,
      jump_height,
      preferred_judge,
      move_up_requested,
      is_scored,
      is_in_ring,
      ring_entry_time,
      ring_exit_time,
      scoring_started_at,
      scoring_completed_at,
      license_key,
      local_id,
      sync_version,
      last_synced_at,
      created_at,
      updated_at,
      deleted_at,
      deleted_by,
      check_in_status,
      payment_method,
      entry_source,
      is_day_of_show,
      registration_id,
      withdrawal_reason,
      refund_amount,
      refund_notes,
      refunded_at,
      stripe_payment_intent_id,
      comped,
      comped_reason,
      discount_amount,
      promo_code_id,
      confirmation_email_sent_at,
      confirmation_email_message_id,
      confirmation_email_status,
      version,
      moved_from_entry_id
`;

export const ENTRY_WITH_STANDARD_RELATIONS_SELECT = `
      ${AUTHENTICATED_ENTRY_READ_COLUMNS},
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
        entry_fee
      ),
      show:show_id (
        id,
        name,
        start_date,
        end_date
      )
`;
