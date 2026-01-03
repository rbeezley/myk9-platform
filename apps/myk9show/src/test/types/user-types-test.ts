// Test file to verify updated user table types work correctly
import type { Database } from '../../types/supabase';

// Test that all the new columns are available in the user table types
type UserTable = Database['public']['Tables']['user'];
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
    phone: null,
    street_address: null,
    city: null,
    state: null,
    zip_code: null,
    profile_image: null,
    roles: null,
    created_at: null,
    updated_at: null,
    user_id: null,
    created_by: null,
    updated_by: null,
    deleted_at: null,
    // New columns that were missing
    country: 'USA',
    date_of_birth: '1990-01-01',
    membership_id: 'MEM123',
    club_affiliations: ['Club A', 'Club B'],
    judge_info: { judgeNumber: 'J123' },
    emergency_contact: { name: 'Jane Doe', phone: '123-456-7890', relationship: 'spouse' },
  };

  // Test insert type
  const mockUserInsert: UserInsert = {
    first_name: 'Jane',
    last_name: 'Smith',
    country: 'Canada',
    date_of_birth: '1985-05-15',
    membership_id: 'MEM456',
    club_affiliations: ['Club C'],
    judge_info: null,
    emergency_contact: null,
  };

  // Test update type
  const mockUserUpdate: UserUpdate = {
    country: 'Mexico',
    date_of_birth: '1992-12-31',
    membership_id: 'MEM789',
    club_affiliations: ['Club D', 'Club E'],
    judge_info: { judgeNumber: 'J456' },
    emergency_contact: { name: 'Bob Smith', phone: '987-654-3210', relationship: 'brother' },
  };

  return { mockUserRow, mockUserInsert, mockUserUpdate };
};

export default testUserAccess;