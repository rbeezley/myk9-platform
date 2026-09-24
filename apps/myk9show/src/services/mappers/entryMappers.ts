// ---------------------------------------------------------------------------
// Replication mappers — convert camelCase replicated types to snake_case DB
// row shapes so downstream consumers (stores, UI) see the same shape as
// PostgREST responses.
// ---------------------------------------------------------------------------

import { mapFields } from './mapperUtils';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';

/**
 * Convert a ReplicatedEntry to the snake_case DB row shape that consumers
 * expect from PostgREST `select('*')`.
 *
 * Optionally attach joined `dog`, `class`, `show` sub-objects when provided.
 */
export const mapReplicatedEntryToDbRow = (
  entry: ReplicatedEntry,
  options?: {
    dog?: ReplicatedDog | null;
    cls?: ReplicatedClass | null;
    show?: ReplicatedShow | null;
    registration?: Record<string, unknown> | null;
    promoCode?: Record<string, unknown> | null;
    trial?: Record<string, unknown> | null;
  }
): Record<string, unknown> => {
  const row: Record<string, unknown> = {
    ...mapFields(entry as unknown as Record<string, unknown>, {
      id: 'id',
      class_id: 'classId',
      show_id: 'showId',
      dog_id: 'dogId',
      // Preserve the canonical owner dependency even when the separate dog
      // cache row is unavailable. At-show consumers use this ID to match a
      // later handler-person hydration completion.
      dog_owner_id: 'dogOwnerId',
      handler_id: 'handlerId',
      armband: 'armband',
      handler: 'handler',
      entry_status: 'entryStatus',
      jump_height: 'jumpHeight',
      entry_fee: 'entryFee',
      total_fees: 'totalFees',
      payment_status: 'paymentStatus',
      payment_method: 'paymentMethod',
      discount_amount: 'discountAmount',
      refund_amount: 'refundAmount',
      refunded_at: 'refundedAt',
      comped: 'comped',
      comped_reason: 'compedReason',
      entry_source: 'entrySource',
      is_day_of_show: 'isDayOfShow',
      run_order: 'runOrder',
      move_up_requested: 'moveUpRequested',
      preferred_judge: 'preferredJudge',
      special_requests: 'specialRequests',
      submitted_at: 'submittedAt',
      registration_id: 'registrationId',
      result_status: 'resultStatus',
      search_time_seconds: 'searchTimeSeconds',
      total_faults: 'totalFaults',
      final_placement: 'finalPlacement',
      disqualification_reason: 'disqualification_reason',
      judge_notes: 'judgeNotes',
      scoring_completed_at: 'scoringCompletedAt',
      ring_entry_time: 'ring_entry_time',
      ring_exit_time: 'ring_exit_time',
      deleted_at: 'deletedAt',
      updated_at: 'updated_at',
      // MYK9-632: the enumerated withdrawal reason, so the offline rebuild of
      // My Shows carries it exactly as the online view read does.
      withdrawal_reason_code: 'withdrawalReasonCode',
      // MYK9-639: the supersession link, so the offline rebuild of the reports
      // and summaries can follow a move-up to the row that holds the money.
      moved_from_entry_id: 'movedFromEntryId',
    }),
    check_in_status: entry.checkInStatus ?? entry.check_in_status ?? null,
    discount_amount: entry.discountAmount ?? entry.discount_amount ?? null,
    refund_amount: entry.refundAmount ?? entry.refund_amount ?? null,
    refunded_at: entry.refundedAt ?? entry.refunded_at ?? null,
    comped: entry.comped ?? null,
    comped_reason: entry.compedReason ?? entry.comped_reason ?? null,
    is_scored: entry.isScored ?? false,
    created_at: entry.submittedAt ?? entry.updated_at ?? null,
    // Replicated entry-result views carry denormalized dog identity so
    // show-day reads can still render when the separate dogs cache is cold.
    dog_call_name: options?.dog?.callName ?? entry.dogCallName ?? entry.dog_call_name ?? null,
    dog_breed: options?.dog?.breed ?? entry.dogBreed ?? entry.dog_breed ?? null,
  };

  // Attach dog sub-object when provided
  if (options?.dog) {
    row.dog = mapReplicatedDogToEntryRow(options.dog);
  } else if (options?.dog === null) {
    row.dog = null;
  }

  // Attach class sub-object when provided
  if (options?.cls) {
    row.class = mapReplicatedClassToEntryRow(options.cls);
  } else if (options?.cls === null) {
    row.class = null;
  }

  // Attach show sub-object when provided
  if (options?.show) {
    row.show = mapReplicatedShowToEntryRow(options.show);
  } else if (options?.show === null) {
    row.show = null;
  }

  if (options?.registration !== undefined) {
    row.registration = options.registration;
  }

  // Attach promo_code sub-object when provided (already snake_case from PostgREST batch)
  if (options?.promoCode !== undefined) {
    row.promo_code = options.promoCode;
  }

  // Attach trial sub-object when provided (already snake_case)
  if (options?.trial !== undefined) {
    row.trial = options.trial;
  }

  return row;
};

/**
 * Convert a ReplicatedDog to the snake_case dog sub-object shape returned
 * by PostgREST when selecting `dog:dog_id(...)`.
 */
export const mapReplicatedDogToEntryRow = (dog: ReplicatedDog): Record<string, unknown> => ({
  ...mapFields(dog as unknown as Record<string, unknown>, {
    id: 'id',
    name: 'name',
    call_name: 'callName',
    breed: 'breed',
  }),
  owner: dog.ownerId
    ? {
        id: dog.ownerId,
        // Owner details are not available from ReplicatedDog — set to null
        first_name: null,
        last_name: null,
        email: null,
        phone: null,
      }
    : null,
});

/**
 * Convert a ReplicatedDog to the detailed dog sub-object shape (includes registration_number).
 */
export const mapReplicatedDogToDetailRow = (dog: ReplicatedDog): Record<string, unknown> => ({
  ...mapFields(dog as unknown as Record<string, unknown>, {
    id: 'id',
    name: 'name',
    call_name: 'callName',
    breed: 'breed',
  }),
  registration_number: null, // Not available from ReplicatedDog
  owner: dog.ownerId
    ? {
        id: dog.ownerId,
        first_name: null,
        last_name: null,
        email: null,
        phone: null,
        address: null,
        city: null,
        state: null,
        postal_code: null,
      }
    : null,
});

/**
 * Convert a ReplicatedClass to the snake_case class sub-object shape returned
 * by PostgREST when selecting `class:class_id(...)`.
 */
export const mapReplicatedClassToEntryRow = (cls: ReplicatedClass): Record<string, unknown> => ({
  ...mapFields(cls as unknown as Record<string, unknown>, {
    id: 'id',
    name: 'name',
    entry_fee: 'entryFee',
    max_entries: 'maxEntries',
    description: 'description',
    trial_id: 'trialId',
  }),
  class_number: null, // class_number is not on ReplicatedClass
  jump_height: cls.jumpHeights?.[0] ?? null,
});

/**
 * Convert a ReplicatedShow to the snake_case show sub-object shape returned
 * by PostgREST when selecting `show:show_id(...)`.
 */
export const mapReplicatedShowToEntryRow = (show: ReplicatedShow): Record<string, unknown> =>
  mapFields(show as unknown as Record<string, unknown>, {
    id: 'id',
    name: 'name',
    start_date: 'startDate',
    end_date: 'endDate',
    entry_close_date: 'entryCloseDate',
    location: 'location',
    venue_name: 'venueName',
    city: 'city',
    state: 'state',
    status: 'status',
    deleted_at: 'deletedAt',
  });
