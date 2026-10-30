import { useEntriesPersonId } from './useEntriesPersonId';
import { useExhibitorProfile } from './useExhibitorProfile';

/**
 * The current user's person id for READS. Prefers the device-cached auth pairing
 * (`useEntriesPersonId`), which survives a cold offline boot; the exhibitor profile
 * is a network-only read that never answers there (MYK9-1493). Undefined while
 * loading or if neither source knows it.
 */
export const useCurrentPersonId = (): string | undefined => {
  const cachedPersonId = useEntriesPersonId();
  const { profile } = useExhibitorProfile();
  return cachedPersonId ?? profile?.person_id;
};
