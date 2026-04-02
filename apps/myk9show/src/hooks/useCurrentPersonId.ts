import { useExhibitorProfile } from './useExhibitorProfile';

/**
 * Returns the current user's person_id from their exhibitor profile.
 * Undefined while loading or if user has no profile.
 */
export const useCurrentPersonId = (): string | undefined => {
  const { profile } = useExhibitorProfile();
  return profile?.person_id;
};
