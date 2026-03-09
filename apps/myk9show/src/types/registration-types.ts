/**
 * Registration types for confirmation number persistence.
 * One registration per person per show — covers all entries for that show.
 */

export interface Registration {
  id: string;
  confirmationNumber: string;
  showId: string;
  handlerId: string;
  paymentStatus: 'pending' | 'paid' | 'refunded' | 'waived';
  paymentReference?: string | undefined;
  notes?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegistrationWithEntries extends Registration {
  entries: RegistrationEntry[];
}

export interface RegistrationEntry {
  id: string;
  dogName?: string;
  className?: string;
  entryStatus?: string;
  entryFee?: number;
}

/** DB row shape from Supabase */
export interface DbRegistration {
  id: string;
  confirmation_number: string;
  show_id: string;
  handler_id: string;
  payment_status: string;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
