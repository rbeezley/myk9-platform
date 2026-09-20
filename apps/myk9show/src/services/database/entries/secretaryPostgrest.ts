import { createDatabaseError, logQuery, supabase } from '../supabaseClient';
import {
  isPullRefundSchemaUnavailable,
  isMoveUpLinkSchemaUnavailable,
  isSecretaryPaymentSchemaUnavailable,
  isWithdrawalReasonCodeSchemaUnavailable,
} from '@/features/payments/pullRefundSchemaCompatibility';
import type { SecretaryEntry } from './secretaryTypes';
import { backfillMissingArmbands } from './reads';

export interface SecretaryPullMetadata {
  id: string;
  withdrawn_at: string | null;
  refund_decision: string | null;
  refund_decided_at: string | null;
  /**
   * MYK9-632: the recognised WITHDRAWAL reason code, null on a pull. It lives on
   * `entries` (column-allowlisted for `authenticated`) and NOT on
   * `view_authenticated_entry_results`, so it rides this side-read exactly like
   * `withdrawn_at` and the refund decision do.
   */
  withdrawal_reason_code: string | null;
}

const SECRETARY_ENTRIES_BASE_SELECT = `
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
        payment_method,
        refund_amount,
        refunded_at,
        stripe_payment_intent_id,
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

/**
 * Secretary payment bookkeeping (20260828200000). Selected separately so a
 * database without that migration still returns entries -- see
 * `isSecretaryPaymentSchemaUnavailable`.
 */
/**
 * MYK9-639's supersession link, appended only when the schema has it.
 *
 * PostgREST fails the WHOLE request with 42703 on an unknown column, and
 * migration 20260918193300 is applied by hand after the merge — so naming it
 * unconditionally would make the cold-store read (a brand-new show, a fresh
 * device) fail outright for the length of the deploy window, exactly as
 * `payment_reference` and `withdrawal_reason_code` would.
 */
const MOVE_UP_LINK_COLUMN = `,
        moved_from_entry_id`;

const SECRETARY_ENTRIES_SELECT_WITH_PAYMENT = `${SECRETARY_ENTRIES_BASE_SELECT},
        payment_reference,
        payment_received_on,
        payment_notes`;

export async function postgrestGetSecretaryEntriesForShow(
  showId: string,
  startTime: number,
  operation: string
): Promise<{ data: SecretaryEntry[]; error: null }> {
  // Reads the gated result view, NOT `public.entries`. 20260620001929 revoked the
  // scored columns (result_status, search_time_seconds, total_faults,
  // final_placement, judge_notes, disqualification_reason) from `authenticated`
  // and re-exposed them through this owner-run view, whose row gate includes
  // `access.can_manage`. Selecting them off `entries` fails the WHOLE request with
  // 42501, which is what made this cold-store fallback -- the path that runs on a
  // brand-new show or a fresh device -- render "Couldn't load entries".
  // This is also the relation `ReplicatedEntriesTable` pulls, so both secretary
  // read paths now agree on columns as well as rows.
  const runSelect = (includePaymentBookkeeping: boolean, includeMoveUpLink: boolean) =>
    supabase
      .from('view_authenticated_entry_results')
      .select(
        (includePaymentBookkeeping
          ? SECRETARY_ENTRIES_SELECT_WITH_PAYMENT
          : SECRETARY_ENTRIES_BASE_SELECT) + (includeMoveUpLink ? MOVE_UP_LINK_COLUMN : '')
      )
      .eq('show_id', showId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

  let includeMoveUpLink = true;
  let response = await runSelect(true, includeMoveUpLink);
  // MYK9-639: the deploy window, same shape as the two below it.
  if (isMoveUpLinkSchemaUnavailable(response.error)) {
    includeMoveUpLink = false;
    response = await runSelect(true, includeMoveUpLink);
  }
  if (isSecretaryPaymentSchemaUnavailable(response.error)) {
    response = await runSelect(false, includeMoveUpLink);
  }
  const { data, error } = response;

  const duration = Date.now() - startTime;
  logQuery('entries', operation, duration, error?.message);

  if (error) {
    throw createDatabaseError(error, 'entries', operation);
  }

  const entries = (data ?? []) as unknown as SecretaryEntry[];
  const authoritativeEntries = await backfillMissingArmbands(
    entries.map(entry => ({
      ...entry,
      armband: entry.armband ?? null,
      show_id: entry.show_id ?? null,
      dog_id: entry.dog_id ?? null,
    }))
  );
  const entriesWithAuthoritativeArmbands = entries.map((entry, index) => {
    const armband = authoritativeEntries[index]?.armband;
    return armband === entry.armband || (armband == null && entry.armband == null)
      ? entry
      : { ...entry, armband };
  });

  // The view carries the scored columns but NOT the pull/refund bookkeeping
  // (`withdrawn_at`, `refund_decision`, `refund_decided_at`), which live only on
  // `entries` -- where they are allowlisted for `authenticated`, so reading them
  // separately is legal. This mirrors what the replicated path does; without it
  // the cold-store fallback would render every scratched entry as "no saved
  // decision" and invite a second refund.
  const pullMetadata = await postgrestGetSecretaryPullMetadataMap(showId).catch(
    // Reconciliation is online-only and must not fail the whole read.
    () => new Map<string, SecretaryPullMetadata>()
  );

  for (const entry of entriesWithAuthoritativeArmbands) {
    const meta = pullMetadata.get(entry.id);
    if (!meta) continue;
    entry.withdrawn_at = meta.withdrawn_at;
    entry.refund_decision = meta.refund_decision;
    entry.refund_decided_at = meta.refund_decided_at;
  }

  return { data: entriesWithAuthoritativeArmbands, error: null };
}

/**
 * Online-only reconciliation metadata layered over the offline entry replica.
 *
 * MYK9-632 widened the row scope from `scratched` alone to BOTH terminal exhibitor
 * states. 'scratched' is a pull and 'withdrawn' is a withdrawal, and the secretary
 * now has to tell them apart — a withdrawal's reason code arrives here for exactly
 * the reason `withdrawn_at` always has: it is on `entries`, not on the view.
 */
export async function postgrestGetSecretaryPullMetadataMap(
  showId: string
): Promise<Map<string, SecretaryPullMetadata>> {
  const runSelect = (includeRefundDecision: boolean, includeReasonCode: boolean) =>
    supabase
      .from('entries')
      .select(
        [
          'id, withdrawn_at',
          includeRefundDecision ? 'refund_decision, refund_decided_at' : null,
          includeReasonCode ? 'withdrawal_reason_code' : null,
        ]
          .filter(Boolean)
          .join(', ')
      )
      .eq('show_id', showId)
      .in('entry_status', ['scratched', 'withdrawn']);

  // Two INDEPENDENT migration-backed column groups, so each is dropped on its
  // own rather than taking the other down with it.
  let includeRefundDecision = true;
  let includeReasonCode = true;
  let response = await runSelect(includeRefundDecision, includeReasonCode);
  if (isWithdrawalReasonCodeSchemaUnavailable(response.error)) {
    includeReasonCode = false;
    response = await runSelect(includeRefundDecision, includeReasonCode);
  }
  if (isPullRefundSchemaUnavailable(response.error)) {
    includeRefundDecision = false;
    response = await runSelect(includeRefundDecision, includeReasonCode);
  }
  const { data, error } = response;

  if (error) {
    throw createDatabaseError(error, 'entries', 'get_secretary_pull_metadata');
  }

  const rows = (data ?? []) as unknown as Array<
    Pick<SecretaryPullMetadata, 'id' | 'withdrawn_at'> &
      Partial<
        Pick<
          SecretaryPullMetadata,
          'refund_decision' | 'refund_decided_at' | 'withdrawal_reason_code'
        >
      >
  >;
  return new Map(
    rows.map(metadata => [
      metadata.id,
      {
        id: metadata.id,
        withdrawn_at: metadata.withdrawn_at,
        refund_decision: metadata.refund_decision ?? null,
        refund_decided_at: metadata.refund_decided_at ?? null,
        withdrawal_reason_code: metadata.withdrawal_reason_code ?? null,
      },
    ])
  );
}
