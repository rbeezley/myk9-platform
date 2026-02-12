/**
 * Types for Exhibitor Profile Page
 */

export interface PersonData {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  profile_image?: string | null;
}

export interface ProfileData {
  person_id: string;
  subscription_tier: string;
  person: PersonData;
}
