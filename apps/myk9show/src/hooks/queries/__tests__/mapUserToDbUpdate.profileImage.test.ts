/**
 * Assertion-first regression for the person profile-image save path.
 *
 * Bug: mapUserToDbUpdate did not map User.profileImage → people.profile_image,
 * so any photo URL written via updateUserMutation was silently dropped before
 * reaching Supabase. The fix adds the mapping; this test guards against it
 * being removed again by testing the REAL exported function.
 */
import { describe, it, expect } from 'vitest';
import { mapUserToDbUpdate } from '../useUsersQuery';

const STORAGE_URL =
  'https://example.supabase.co/storage/v1/object/public/images/profiles/auth-uid-1/123-photo.jpg';

describe('mapUserToDbUpdate — profileImage → profile_image', () => {
  it('maps profileImage to profile_image (not silently dropped)', () => {
    const dbUpdate = mapUserToDbUpdate({ profileImage: STORAGE_URL });
    // The Storage URL — not a `data:` URL — must reach the DB column.
    expect(dbUpdate.profile_image).toBe(STORAGE_URL);
  });

  it('does not write profile_image when profileImage is undefined', () => {
    const dbUpdate = mapUserToDbUpdate({ firstName: 'Alice' });
    expect(Object.keys(dbUpdate)).not.toContain('profile_image');
  });

  it('writes profile_image alongside other fields', () => {
    const dbUpdate = mapUserToDbUpdate({ firstName: 'Alice', profileImage: STORAGE_URL });
    expect(dbUpdate.profile_image).toBe(STORAGE_URL);
    expect(dbUpdate.first_name).toBe('Alice');
  });
});
