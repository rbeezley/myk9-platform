/**
 * Show registration queries — CRUD operations for the enrollments table.
 * One enrollment per person per show with auto-generated MK9-XXXXXX confirmation numbers.
 *
 * MYK9-1634: the client writes an enrollment's payment DETAILS only. Its total,
 * payment status, paid amount and payment method are the database's (see
 * `enrollmentPaymentFields.ts`).
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { mapDbToRegistration } from '../../mappers/registrationMappers';
import type { Registration, DbRegistration } from '@/types/registration-types';
import type { PaymentDetails } from '@/types/show-registration-types';
import { buildEnrollmentPaymentDetailFields } from './enrollmentPaymentFields';

const POSTGRES_UNIQUE_VIOLATION = '23505';

async function updateEnrollmentPaymentDetails(
  existing: Registration,
  paymentDetails: PaymentDetails | undefined,
  startTime: number
): Promise<{
  data: Registration | null;
  error: ReturnType<typeof createDatabaseError> | null;
}> {
  const detailFields = buildEnrollmentPaymentDetailFields(paymentDetails);
  if (Object.keys(detailFields).length === 0) {
    return { data: existing, error: null };
  }

  const { data, error } = await supabase
    .from('enrollments')
    .update(detailFields)
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
 * Get or create the person's enrollment for a show. The DB trigger
 * auto-generates the confirmation number. Payment details, when given, are
 * written onto it (only the ones given). If a concurrent insert wins the
 * unique constraint, the existing row is used.
 */
export const createShowRegistration = async (
  showId: string,
  handlerId: string,
  paymentDetails?: PaymentDetails
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
      return updateEnrollmentPaymentDetails(existing.data, paymentDetails, startTime);
    }

    const { data, error } = await supabase
      .from('enrollments')
      .insert({
        show_id: showId,
        handler_id: handlerId,
        ...buildEnrollmentPaymentDetailFields(paymentDetails),
      })
      .select('*')
      .single();

    const duration = Date.now() - startTime;
    logQuery('enrollments', 'insert', duration, error?.message);

    if (error) {
      // Concurrent insert race: return the existing registration
      if (error.code === POSTGRES_UNIQUE_VIOLATION) {
        const existingAfterRace = await getRegistrationByShowAndHandler(showId, handlerId);
        if (existingAfterRace.error || !existingAfterRace.data) {
          return existingAfterRace;
        }
        return updateEnrollmentPaymentDetails(existingAfterRace.data, paymentDetails, startTime);
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
