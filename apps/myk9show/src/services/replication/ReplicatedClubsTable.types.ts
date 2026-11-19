/**
 * Database row type for clubs table
 * Note: Using manual type because Supabase types file has incorrect table name ('club' vs 'clubs')
 */
export interface ClubRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  description: string | null;
  license_key?: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  // MYK9-572
  authorized_at: string | null;
  // Add other common fields returned by Supabase to avoid type mismatch
  [key: string]: string | null | undefined;
}
