// Test file to verify updated user table types work correctly
import type { Database } from '../../types/supabase';

// Test that the current person-profile columns are available in the people table types.
type UserTable = Database['public']['Tables']['people'];
type UserRow = UserTable['Row'];
type UserInsert = UserTable['Insert'];
type UserUpdate = UserTable['Update'];

// Test accessing the new columns
const testUserAccess = () => {
  // These should all compile without TypeScript errors
  const mockUserRow: UserRow = {
    id: 'test-id',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    agreed_to_tos_at: null,
    auth_user_id: null,
    bio: null,
    phone: null,
    street_address: null,
    city: null,
    state: null,
    zip_code: null,
    profile_image: null,
    status: 'active',
    created_at: null,
    updated_at: null,
    deleted_at: null,
    deleted_by: null,
    early_adopter_until: null,
    license_key: null,
    country: 'USA',
  };

  // Test insert type
  const mockUserInsert: UserInsert = {
    first_name: 'Jane',
    last_name: 'Smith',
    country: 'Canada',
    status: 'active',
  };

  // Test update type
  const mockUserUpdate: UserUpdate = {
    country: 'Mexico',
    bio: 'Updated profile',
  };

  return { mockUserRow, mockUserInsert, mockUserUpdate };
};

export default testUserAccess;
