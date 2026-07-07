/**
 * Show registration queries — CRUD operations for the enrollments table.
 * One enrollment per person per show with auto-generated MK9-XXXXXX confirmation numbers.
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { mapDbToRegistration, mapDbToRegistrationArray } from '../../mappers/registrationMappers';
import type { Registration, DbRegistration } from '@/types/registration-types';
import {
  PaymentStatus,
  type PaymentDetails,
  type PaymentMethod,
} from '@/types/show-registration-types';
import type { TablesUpdate } from '@/types/supabase';

const POSTGRES_UNIQUE_VIOLATION = '23505';

function paymentMethodToEnrollmentStatus(
  paymentMethod: PaymentMethod | undefined
): string | undefined {
  switch (paymentMethod) {
    case 'check':
    case 'cash':
      return PaymentStatus.PENDING;
    case 'secretary_paid':
    case 'group_payment':
      return 'paid';
    case 'waived':
      return 'waived';
    case 'credit_card':
      return PaymentStatus.PENDING;
    default:
      return undefined;
  }
}

function isEnrollmentPaidAtSubmit(paymentStatus: string | undefined): boolean {
  return (
    paymentStatus === 'paid' ||
    paymentStatus === PaymentStatus.PAID_BY_CHECK ||
    paymentStatus === PaymentStatus.PAID_BY_CASH
  );
}

function buildEnrollmentPaymentFields({
  paymentReference,
  paymentDetails,
  paymentMethod,
  totalAmountCents,
  existingTotalAmountCents = 0,
  existingPaidAmountDollars = 0,
  includeEmptyPaymentDetails = false,
  preservePaidAmountForPending = false,
}: {
  paymentReference?: string | undefined;
  paymentDetails?: PaymentDetails | undefined;
  paymentMethod?: PaymentMethod | undefined;
  totalAmountCents?: number | undefined;
  existingTotalAmountCents?: number | null | undefined;
  existingPaidAmountDollars?: number | null | undefined;
  includeEmptyPaymentDetails?: boolean | undefined;
  preservePaidAmountForPending?: boolean | undefined;
}): TablesUpdate<'enrollments'> {
  const paymentStatus = paymentMethodToEnrollmentStatus(paymentMethod);
  const nextTotalAmountCents =
    totalAmountCents !== undefined ? (existingTotalAmountCents ?? 0) + totalAmountCents : undefined;
  const isRecordedPaid = isEnrollmentPaidAtSubmit(paymentStatus);
  const paidAmount = isRecordedPaid
    ? (existingPaidAmountDollars ?? 0) + (totalAmountCents ?? 0) / 100
    : 0;
  const nextTotalAmountDollars =
    nextTotalAmountCents !== undefined ? nextTotalAmountCents / 100 : undefined;
  const resolvedPaymentStatus =
    isRecordedPaid && nextTotalAmountDollars !== undefined && paidAmount < nextTotalAmountDollars
      ? PaymentStatus.PENDING
      : paymentStatus;
  const shouldPreservePaidAmount =
    preservePaidAmountForPending && paymentStatus === PaymentStatus.PENDING;

  const fields: TablesUpdate<'enrollments'> = {
    ...(resolvedPaymentStatus
      ? {
          payment_status: resolvedPaymentStatus,
          ...(!shouldPreservePaidAmount ? { paid_amount: paidAmount } : {}),
        }
      : {}),
    ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    ...(nextTotalAmountCents !== undefined ? { total_amount: nextTotalAmountCents } : {}),
  };

  if (includeEmptyPaymentDetails || paymentReference !== undefined) {
    fields.payment_reference = paymentReference ?? null;
  }
  if (includeEmptyPaymentDetails || paymentDetails?.checkNumber !== undefined) {
    fields.check_number = paymentDetails?.checkNumber ?? null;
  }
  if (includeEmptyPaymentDetails || paymentDetails?.paymentDate !== undefined) {
    fields.payment_date = paymentDetails?.paymentDate ?? null;
  }
  if (includeEmptyPaymentDetails || paymentDetails?.groupReference !== undefined) {
    fields.group_reference = paymentDetails?.groupReference ?? null;
  }
  if (includeEmptyPaymentDetails || paymentDetails?.paymentNotes !== undefined) {
    fields.payment_notes = paymentDetails?.paymentNotes ?? null;
  }

  return fields;
}

function hasEnrollmentPaymentInput({
  paymentReference,
  paymentDetails,
  paymentMethod,
  totalAmountCents,
}: {
  paymentReference?: string | undefined;
  paymentDetails?: PaymentDetails | undefined;
  paymentMethod?: PaymentMethod | undefined;
  totalAmountCents?: number | undefined;
}): boolean {
  return Boolean(
    paymentReference || paymentDetails || paymentMethod || totalAmountCents !== undefined
  );
}

async function updateExistingEnrollmentPayment({
  existing,
  paymentReference,
  paymentDetails,
  paymentMethod,
  totalAmountCents,
  startTime,
}: {
  existing: Registration;
  paymentReference?: string | undefined;
  paymentDetails?: PaymentDetails | undefined;
  paymentMethod?: PaymentMethod | undefined;
  totalAmountCents?: number | undefined;
  startTime: number;
}): Promise<{
  data: Registration | null;
  error: ReturnType<typeof createDatabaseError> | null;
}> {
  const { data, error } = await supabase
    .from('enrollments')
    .update(
      buildEnrollmentPaymentFields({
        paymentReference,
        paymentDetails,
        paymentMethod,
        totalAmountCents,
        existingTotalAmountCents: existing.totalAmount,
        existingPaidAmountDollars: existing.paidAmount,
        preservePaidAmountForPending: true,
      })
    )
    .eq('id', existing.id)
    .select('*')
    .single();

  const duration = Date.now() - startTime;
  logQuery('enrollments', 'update_existing_payment', duration, error?.message);

  if (error) {
    throw createDatabaseError(error, 'enrollments', 'update_existing_payment');
  }

  return { data: mapDbToRegistration(data as DbRegistration), error: null };
}

function mapEnrollmentPaymentStatusToEntryStatus(
  paymentStatus: string
): 'pending' | 'paid' | 'refunded' | 'waived' {
  // Keep this collapse aligned with mapEnrollmentStatusToEntryPaymentStatus in
  // hooks/useEntryManagementActions.ts. Entries can only persist coarse values.
  switch (paymentStatus) {
    case 'paid':
    case 'paid_online':
    case 'paid_by_cash':
    case 'paid_by_check':
      return 'paid';
    case 'refunded':
    case 'partial_refund':
      return 'refunded';
    case 'waived':
      return 'waived';
    case 'pending':
    default:
      return 'pending';
  }
}

/**
 * Create a new registration. The DB trigger auto-generates the confirmation number.
 * If a registration already exists for this show+handler (unique constraint),
 * falls back to returning the existing one.
 */
export const createShowRegistration = async (
  showId: string,
  handlerId: string,
  paymentReference?: string,
  paymentDetails?: PaymentDetails,
  paymentMethod?: PaymentMethod,
  totalAmountCents?: number
): Promise<{
  data: Registration | null;
  error: ReturnType<typeof createDatabaseError> | null;
}> => {
  const startTime = Date.now();

  try {
    const existing = await getRegistrationByShowAndHandler(showId, handlerId);
    if (existing.error) {
      return existing;
    }
    if (existing.data) {
      if (
        !hasEnrollmentPaymentInput({
          paymentReference,
          paymentDetails,
          paymentMethod,
          totalAmountCents,
        })
      ) {
        return existing;
      }

      return updateExistingEnrollmentPayment({
        existing: existing.data,
        paymentReference,
        paymentDetails,
        paymentMethod,
        totalAmountCents,
        startTime,
      });
    }

    const { data, error } = await supabase
      .from('enrollments')
      .insert({
        show_id: showId,
        handler_id: handlerId,
        ...buildEnrollmentPaymentFields({
          paymentReference,
          paymentDetails,
          paymentMethod,
          totalAmountCents,
          includeEmptyPaymentDetails: true,
        }),
      })
      .select('*')
      .single();

    const duration = Date.now() - startTime;
    logQuery('enrollments', 'insert', duration, error?.message);

    if (error) {
      // Concurrent insert race: return the existing registration
      if (error.code === POSTGRES_UNIQUE_VIOLATION) {
        const existingAfterRace = await getRegistrationByShowAndHandler(showId, handlerId);
        if (
          existingAfterRace.error ||
          !existingAfterRace.data ||
          !hasEnrollmentPaymentInput({
            paymentReference,
            paymentDetails,
            paymentMethod,
            totalAmountCents,
          })
        ) {
          return existingAfterRace;
        }
        return updateExistingEnrollmentPayment({
          existing: existingAfterRace.data,
          paymentReference,
          paymentDetails,
          paymentMethod,
          totalAmountCents,
          startTime,
        });
      }
      throw createDatabaseError(error, 'enrollments', 'insert');
    }

    return { data: mapDbToRegistration(data as DbRegistration), error: null };
  } catch (err) {
    const duration = Date.now() - startTime;
    logQuery('enrollments', 'insert', duration, String(err));
    const dbError = createDatabaseError(
      err instanceof Error ? err : new Error(String(err)),
      'enrollments',
      'insert'
    );
    return { data: null, error: dbError };
  }
};

/**
 * Find an existing registration for a person + show.
 * Used for add-on entries (fold into existing registration).
 */
export const getRegistrationByShowAndHandler = async (
  showId: string,
  handlerId: string
): Promise<{
  data: Registration | null;
  error: ReturnType<typeof createDatabaseError> | null;
}> => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('enrollments')
      .select('*')
      .eq('show_id', showId)
      .eq('handler_id', handlerId)
      .maybeSingle();

    const duration = Date.now() - startTime;
    logQuery('enrollments', 'select_by_show_handler', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'enrollments', 'select_by_show_handler');
    }

    return {
      data: data ? mapDbToRegistration(data as DbRegistration) : null,
      error: null,
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    logQuery('enrollments', 'select_by_show_handler', duration, String(err));
    const dbError = createDatabaseError(
      err instanceof Error ? err : new Error(String(err)),
      'enrollments',
      'select_by_show_handler'
    );
    return { data: null, error: dbError };
  }
};

/**
 * Look up a registration by its confirmation number (e.g. MK9-000142).
 * Case-insensitive matching.
 */
export const getRegistrationByConfirmationNumber = async (
  confirmationNumber: string
): Promise<{
  data: Registration | null;
  error: ReturnType<typeof createDatabaseError> | null;
}> => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('enrollments')
      .select('*')
      .ilike('confirmation_number', confirmationNumber.trim())
      .maybeSingle();

    const duration = Date.now() - startTime;
    logQuery('enrollments', 'select_by_confirmation', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'enrollments', 'select_by_confirmation');
    }

    return {
      data: data ? mapDbToRegistration(data as DbRegistration) : null,
      error: null,
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    logQuery('enrollments', 'select_by_confirmation', duration, String(err));
    const dbError = createDatabaseError(
      err instanceof Error ? err : new Error(String(err)),
      'enrollments',
      'select_by_confirmation'
    );
    return { data: null, error: dbError };
  }
};

/**
 * Get all registrations for a show (secretary view).
 */
export const getRegistrationsForShow = async (
  showId: string
): Promise<{
  data: Registration[];
  error: ReturnType<typeof createDatabaseError> | null;
}> => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('enrollments')
      .select('*')
      .eq('show_id', showId)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('enrollments', 'select_by_show', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'enrollments', 'select_by_show');
    }

    return {
      data: mapDbToRegistrationArray((data ?? []) as DbRegistration[]),
      error: null,
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    logQuery('enrollments', 'select_by_show', duration, String(err));
    const dbError = createDatabaseError(
      err instanceof Error ? err : new Error(String(err)),
      'enrollments',
      'select_by_show'
    );
    return { data: [], error: dbError };
  }
};

/**
 * Update a registration's payment status.
 */
export const updateRegistrationPayment = async (
  registrationId: string,
  paymentStatus: string,
  paymentReference?: string
): Promise<{
  data: Registration | null;
  error: ReturnType<typeof createDatabaseError> | null;
}> => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('enrollments')
      .update({
        payment_status: paymentStatus,
        payment_reference: paymentReference ?? null,
      })
      .eq('id', registrationId)
      .select('*')
      .single();

    const duration = Date.now() - startTime;
    logQuery('enrollments', 'update_payment', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'enrollments', 'update_payment');
    }

    return { data: mapDbToRegistration(data as DbRegistration), error: null };
  } catch (err) {
    const duration = Date.now() - startTime;
    logQuery('enrollments', 'update_payment', duration, String(err));
    const dbError = createDatabaseError(
      err instanceof Error ? err : new Error(String(err)),
      'enrollments',
      'update_payment'
    );
    return { data: null, error: dbError };
  }
};

/**
 * Get the confirmation number for entries via their registration_id.
 * Returns a map of registration_id → confirmation_number.
 */
export const getConfirmationNumbersForEntries = async (
  registrationIds: string[]
): Promise<{
  data: Map<string, string>;
  error: ReturnType<typeof createDatabaseError> | null;
}> => {
  const startTime = Date.now();
  const uniqueIds = [...new Set(registrationIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return { data: new Map(), error: null };
  }

  try {
    const { data, error } = await supabase
      .from('enrollments')
      .select('id, confirmation_number')
      .in('id', uniqueIds);

    const duration = Date.now() - startTime;
    logQuery('enrollments', 'select_confirmation_numbers', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'enrollments', 'select_confirmation_numbers');
    }

    const map = new Map<string, string>();
    for (const row of data ?? []) {
      map.set(row.id, row.confirmation_number);
    }

    return { data: map, error: null };
  } catch (err) {
    const duration = Date.now() - startTime;
    logQuery('enrollments', 'select_confirmation_numbers', duration, String(err));
    const dbError = createDatabaseError(
      err instanceof Error ? err : new Error(String(err)),
      'enrollments',
      'select_confirmation_numbers'
    );
    return { data: new Map(), error: dbError };
  }
};

/**
 * Update the payment status (and optionally payment_reference) for an enrollment.
 * Used by secretaries to record cash/check payments received on show day.
 */
export const updateEnrollmentPaymentStatus = async (
  enrollmentId: string,
  paymentStatus: string,
  paymentReference?: string | null,
  paidAmount?: number | null,
  refundAmount?: number | null,
  refundNotes?: string | null
) => {
  const startTime = Date.now();
  try {
    const updateData: TablesUpdate<'enrollments'> = {
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    };
    if (paymentReference !== undefined) {
      updateData.payment_reference = paymentReference;
    }
    if (paidAmount != null) {
      updateData.paid_amount = paidAmount;
    }
    if (refundAmount != null) {
      updateData.refund_amount = refundAmount;
      updateData.refunded_at = new Date().toISOString();
    }
    if (refundNotes != null) {
      updateData.refund_notes = refundNotes;
    }

    const { data, error } = await supabase
      .from('enrollments')
      .update(updateData)
      .eq('id', enrollmentId)
      .select('id, payment_status, payment_reference, paid_amount')
      .single();

    const duration = Date.now() - startTime;
    logQuery('enrollments', 'update_payment_status', duration, error?.message);

    if (error) throw createDatabaseError(error, 'enrollments', 'update_payment_status');

    const entryPaymentStatus = mapEnrollmentPaymentStatusToEntryStatus(paymentStatus);
    const entryUpdateData: TablesUpdate<'entries'> = {
      payment_status: entryPaymentStatus,
      updated_at: new Date().toISOString(),
    };
    const { error: entriesError } = await supabase
      .from('entries')
      .update(entryUpdateData)
      .eq('registration_id', enrollmentId)
      .neq('payment_status', 'refunded')
      .neq('payment_status', 'waived');

    logQuery(
      'entries',
      'cascade_enrollment_payment_status',
      Date.now() - startTime,
      entriesError?.message
    );

    if (entriesError)
      return {
        data,
        error: createDatabaseError(entriesError, 'entries', 'cascade_enrollment_payment_status'),
      };

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'enrollments', 'update_payment_status');
    logQuery('enrollments', 'update_payment_status', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
