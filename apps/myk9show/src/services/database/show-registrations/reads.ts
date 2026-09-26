/**
 * Show registration queries — CRUD operations for the enrollments table.
 * One enrollment per person per show with auto-generated MK9-XXXXXX confirmation numbers.
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { mapDbToRegistration } from '../../mappers/registrationMappers';
import type { Registration, DbRegistration } from '@/types/registration-types';
import type { PaymentDetails, PaymentMethod } from '@/types/show-registration-types';
import { buildSelfServiceEnrollmentPaymentFields } from './selfServiceEnrollmentFields';
import {
  buildEnrollmentPaymentFields,
  hasEnrollmentPaymentInput,
  shouldPreserveFinancialForWaived,
} from './enrollmentPaymentFields';

const POSTGRES_UNIQUE_VIOLATION = '23505';

async function updateExistingEnrollmentPayment({
  existing,
  paymentReference,
  paymentDetails,
  paymentMethod,
  totalAmountCents,
  selfService,
  startTime,
}: {
  existing: Registration;
  paymentReference?: string | undefined;
  paymentDetails?: PaymentDetails | undefined;
  paymentMethod?: PaymentMethod | undefined;
  totalAmountCents?: number | undefined;
  selfService?: boolean | undefined;
  startTime: number;
}): Promise<{
  data: Registration | null;
  error: ReturnType<typeof createDatabaseError> | null;
}> {
  // An exhibitor submitting their own entries may not touch payment_status;
  // trg_restrict_payment_status rejects the whole statement (MYK9-486).
  const paymentFields = selfService
    ? buildSelfServiceEnrollmentPaymentFields({
        existingPaymentStatus: existing.paymentStatus,
        existingTotalAmountCents: existing.totalAmount,
        paymentMethod,
        totalAmountCents,
      })
    : buildEnrollmentPaymentFields({
        paymentReference,
        paymentDetails,
        paymentMethod,
        totalAmountCents,
        existingTotalAmountCents: existing.totalAmount,
        existingPaidAmountDollars: existing.paidAmount,
        includeEmptyPaymentDetails: paymentMethod !== undefined && paymentMethod !== 'waived',
        preservePaidAmountForPending: true,
        preserveFinancialForWaived: shouldPreserveFinancialForWaived(existing, paymentMethod),
      });

  if (Object.keys(paymentFields).length === 0) {
    return { data: existing, error: null };
  }

  const { data, error } = await supabase
    .from('enrollments')
    .update(paymentFields)
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
  totalAmountCents?: number,
  /**
   * Set for an exhibitor entering their own dogs. Restricts the write to the
   * columns an unprivileged caller is allowed to change — no payment_status,
   * no paid_amount, no null-out of secretary-entered payment details. See
   * `selfServiceEnrollmentFields.ts` (MYK9-486).
   */
  options?: { selfService?: boolean | undefined }
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
        selfService: options?.selfService,
        startTime,
      });
    }

    const { data, error } = await supabase
      .from('enrollments')
      .insert({
        show_id: showId,
        handler_id: handlerId,
        ...(options?.selfService
          ? buildSelfServiceEnrollmentPaymentFields({ paymentMethod, totalAmountCents })
          : buildEnrollmentPaymentFields({
              paymentReference,
              paymentDetails,
              paymentMethod,
              totalAmountCents,
              includeEmptyPaymentDetails: true,
            })),
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
          selfService: options?.selfService,
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
