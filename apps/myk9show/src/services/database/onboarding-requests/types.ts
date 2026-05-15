// Shared types and DB-row mapper for Onboarding Requests.
// reads.ts and writes.ts both import from here.

export interface OnboardingRequest {
  id: string;
  authUserId: string;
  clubName: string;
  organization: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  firstShowDate: string | null;
  message: string | null;
  status: 'pending' | 'contacted' | 'onboarded' | 'declined';
  createdAt: string;
  notes: string | null;
}

export interface CreateOnboardingRequest {
  authUserId: string;
  clubName: string;
  organization: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | undefined;
  firstShowDate?: string | undefined;
  message?: string | undefined;
}

export interface DbOnboardingRow {
  id: string;
  auth_user_id: string;
  club_name: string;
  organization: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  first_show_date: string | null;
  message: string | null;
  status: string;
  created_at: string;
  notes: string | null;
}

export function mapDbRow(row: DbOnboardingRow): OnboardingRequest {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    clubName: row.club_name,
    organization: row.organization,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    firstShowDate: row.first_show_date,
    message: row.message,
    status: row.status as OnboardingRequest['status'],
    createdAt: row.created_at,
    notes: row.notes,
  };
}
