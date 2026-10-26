import { createContext } from 'react';
import type { ShowOfficials } from '@/hooks/queries/useShowOfficials';

/**
 * MYK9-1288: who a visitor contacts for late-entry help once entries are closed.
 *
 * ShowPublicLanding reads the show's officials and provides the first secretary
 * here (null = none listed, or the read failed or has not landed). A context
 * rather than a prop for the same reason as LandingMailInContext: the closed-
 * entries sentence lives in a dozen section components across the styles.
 */
export interface LateEntryContactInfo {
  name: string | null;
  email: string | null;
}

/** `undefined` = unknown (loading, failed, no provider); `null` = the read succeeded and no secretary is listed. */
export const LateEntryContactContext = createContext<LateEntryContactInfo | null | undefined>(
  undefined
);

/** The first listed secretary as contact info, or null when there is none. */
export function pickLateEntryContact(
  officials: ShowOfficials | null | undefined
): LateEntryContactInfo | null {
  const secretary = officials?.secretaries[0];
  if (!secretary) return null;
  const name = `${secretary.firstName} ${secretary.lastName}`.trim() || null;
  const email = secretary.email?.trim() || null;
  return name || email ? { name, email } : null;
}

/**
 * MYK9-1423: true once the show has run. Entries are necessarily closed by then, so the
 * late-entry offer (and its mailto) gives way to a past-tense sentence. Provided once by
 * ShowPublicLanding from the same `hasShowHappened` rule the roster uses.
 */
export const ShowHasHappenedContext = createContext(false);
