/**
 * Show registration queries — CRUD operations for the enrollments table.
 * One enrollment per person per show with auto-generated MK9-XXXXXX confirmation numbers.
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { mapDbToRegistration, mapDbToRegistrationArray } from '../../mappers/registrationMappers';
import type { Registration, DbRegistration } from '@/types/registration-types';
import type { PaymentDetails } from '@/types/show-registration-types';

const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * Create a new registration. The DB trigger auto-generates the confirmation number.
 * If a registration already exists for this show+handler (unique constraint),
 * falls back to returning the existing one.
 */
export const createShowRegistration = async (
  showId: string,
  handlerId: string,
  paymentReference?: string,
  paymentDetails?: PaymentDetails
): Promise<{
  data: Registration | null;
  error: ReturnType<typeof createDatabaseError> | null;
}> => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('enrollments')
      .insert({
        show_id: showId,
        handler_id: handlerId,
        payment_reference: paymentReference ?? null,
        check_number: paymentDetails?.checkNumber ?? null,
        payment_date: paymentDetails?.paymentDate ?? null,
        group_reference: paymentDetails?.groupReference ?? null,
        payment_notes: paymentDetails?.paymentNotes ?? null,
      })
      .select('*')
      .single();

    const duration = Date.now() - startTime;
    logQuery('enrollments', 'insert', duration, error?.message);

    if (error) {
      // Concurrent insert race: return the existing registration
      if (error.code === POSTGRES_UNIQUE_VIOLATION) {
        return getRegistrationByShowAndHandler(showId, handlerId);
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
  paymentReference?: string | null
) => {
  const startTime = Date.now();
  try {
    const updateData: Record<string, unknown> = {
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    };
    if (paymentReference !== undefined) {
      updateData.payment_reference = paymentReference;
    }

    const { data, error } = await supabase
      .from('enrollments')
      .update(updateData)
      .eq('id', enrollmentId)
      .select('id, payment_status, payment_reference')
      .single();

    const duration = Date.now() - startTime;
    logQuery('enrollments', 'update_payment_status', duration, error?.message);

    if (error) throw createDatabaseError(error, 'enrollments', 'update_payment_status');
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'enrollments', 'update_payment_status');
    logQuery('enrollments', 'update_payment_status', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
