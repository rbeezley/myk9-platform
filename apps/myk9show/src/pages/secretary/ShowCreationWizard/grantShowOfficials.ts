/**
 * Grants the show-scoped official roles a newly saved show needs, via the
 * `grant_show_official` RPC (migration 144).
 *
 * Extracted from `useShowCreationWizardActions` so the hook stays under the
 * 500-line ceiling, and so the offline rule below lives in exactly one place.
 *
 * The offline rule matters: these RPCs all reject when there is no network, and
 * `showCreationWizardValidation` REQUIRES both a chairman and a secretary, so
 * there are always at least two grants. An offline save therefore failed 100%
 * of the time — and the caller's catch block then compensating-deleted the show
 * the secretary had just finished entering. The show itself is offline-capable;
 * the grants are not. Skipping them and saying so preserves the work.
 */
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/utils/logger';
import { UserRole } from '@/types/auth-types';
import { OfficialsNotAssignedError } from './showSaveErrors';

interface ShowOfficials {
  secretary: string[];
  chairman: string[];
  steward: string[];
}

export interface GrantShowOfficialsResult {
  /** Grants that were deliberately not attempted because the device is offline. */
  deferredOffline: number;
}

export async function grantShowOfficials({
  showId,
  officials,
  isOnline,
}: {
  showId: string;
  officials: ShowOfficials;
  isOnline: boolean;
}): Promise<GrantShowOfficialsResult> {
  const grants = [
    ...(officials.secretary ?? []).map(id => ({ id, role: UserRole.SECRETARY })),
    ...(officials.chairman ?? []).map(id => ({ id, role: UserRole.CHAIRMAN })),
    ...(officials.steward ?? []).map(id => ({ id, role: UserRole.STEWARD })),
  ];

  if (!isOnline) {
    return { deferredOffline: grants.length };
  }

  const results = await Promise.allSettled(
    grants.map(async grant => {
      const { error } = await supabase.rpc('grant_show_official', {
        p_person_id: grant.id,
        p_role_name: grant.role,
        p_show_id: showId,
      });
      if (error) throw error;
    })
  );

  const failures = results.filter(result => result.status === 'rejected');
  failures.forEach(result => {
    const reason = (result as PromiseRejectedResult).reason;
    logger.warn('Failed to grant official role', 'wizard', {
      error: reason instanceof Error ? reason.message : String(reason),
    });
  });

  if (failures.length > 0) {
    // The show row already exists. Signal a PARTIAL success so the caller keeps
    // it rather than deleting it and inviting a duplicating retry.
    throw new OfficialsNotAssignedError(showId, failures.length);
  }

  return { deferredOffline: 0 };
}

/** Copy for grants intentionally skipped because the device was offline. */
export function officialsDeferredOfflineMessage(count: number): string {
  return `Show saved on this device. ${count} official assignment${
    count === 1 ? '' : 's'
  } still need to be made — open the show’s Officials tab once you’re back online.`;
}
