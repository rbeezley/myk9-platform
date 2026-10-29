import { useAuthContext } from './useAuthContext';
import { useExhibitorProfile } from './useExhibitorProfile';

/**
 * The current user's person id. Prefers the auth context's pairing, which is
 * device-cached and so survives a cold offline boot; the exhibitor profile is a
 * network-only read that never answers there (MYK9-1493). Undefined while
 * loading or if neither source knows it.
 */
export const useCurrentPersonId = (): string | undefined => {
  const { personId } = useAuthContext();
  const { profile } = useExhibitorProfile();
  return personId ?? profile?.person_id;
};
