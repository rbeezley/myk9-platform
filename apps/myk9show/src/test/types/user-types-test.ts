import type { Database } from '../../types/supabase';

type PersonTable = Database['public']['Tables']['people'];

const personRow: PersonTable['Row'] = {
  agreed_to_tos_at: null,
  auth_user_id: null,
  bio: null,
  city: null,
  country: 'USA',
  created_at: null,
  deleted_at: null,
  deleted_by: null,
  early_adopter_until: null,
  email: 'john@example.com',
  first_name: 'John',
  id: 'person-1',
  last_name: 'Doe',
  license_key: null,
  phone: null,
  profile_image: null,
  state: null,
  status: 'active',
  street_address: null,
  updated_at: null,
  zip_code: null,
};

const personInsert: PersonTable['Insert'] = {
  first_name: 'Jane',
  last_name: 'Smith',
  country: 'Canada',
};

const personUpdate: PersonTable['Update'] = {
  country: 'Mexico',
  early_adopter_until: '2026-12-31T00:00:00Z',
};

export const personTypeFixtures = { personRow, personInsert, personUpdate };
