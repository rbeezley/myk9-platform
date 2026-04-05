/**
 * Registration mappers — DB ↔ UI type transforms
 */
import type { Registration, DbRegistration } from '@/types/registration-types';

export function mapDbToRegistration(row: DbRegistration): Registration {
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    showId: row.show_id,
    handlerId: row.handler_id,
    paymentStatus: row.payment_status as Registration['paymentStatus'],
    paymentReference: row.payment_reference ?? undefined,
    checkNumber: row.check_number ?? undefined,
    paymentDate: row.payment_date ?? undefined,
    groupReference: row.group_reference ?? undefined,
    paymentNotes: row.payment_notes ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapDbToRegistrationArray(rows: DbRegistration[]): Registration[] {
  return rows.map(mapDbToRegistration);
}
