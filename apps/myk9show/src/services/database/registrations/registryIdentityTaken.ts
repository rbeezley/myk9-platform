/**
 * Is this registry identity already held by a live dog (MYK9-1162)?
 *
 * An exhibitor's device holds only their own dogs, so Add Dog cannot tell from
 * the device copy that a number belongs to someone else's dog. The server
 * answers with a bare yes or no (`registry_identity_taken`): no dog, owner or
 * registration details.
 *
 * Online-only by design, like the other permission and uniqueness checks. It
 * never blocks and never throws: `null` means "could not find out" (offline,
 * timed out, any error, or a server that does not have the function yet), and
 * the caller carries on with what the device knows. The server's unique index
 * on live registry identities remains the final guard at upload.
 */
import { onlineManager } from '@tanstack/react-query';
import { withTimeout } from '@myk9/core';
import { supabase } from '../supabaseClient';

/** A stalled venue connection must not hold up Add Dog for longer than this. */
const CHECK_TIMEOUT_MS = 5_000;

export async function isRegistryIdentityTaken(
  organization: string,
  registrationNumber: string
): Promise<boolean | null> {
  if (!onlineManager.isOnline()) return null;
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('registry_identity_taken', {
        p_organization: organization,
        p_registration_number: registrationNumber,
      }),
      CHECK_TIMEOUT_MS,
      'registry_identity_taken'
    );
    if (error) return null;
    return typeof data === 'boolean' ? data : null;
  } catch {
    return null;
  }
}
