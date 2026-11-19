/**
 * MYK9-2053: the show's secretary and chairman for the premium, from `show_officials` (through
 * get_show_officials), the same source the requirements checklist and the Personnel tab read.
 * generate-premium still reads the old `user_roles` rows, which no longer hold officials, so
 * every premium it returns has no secretary or chair until this is applied.
 */
import {
  fetchShowOfficials,
  type ShowOfficial,
  type ShowOfficials,
} from '@/hooks/queries/useShowOfficials';
import type { GeneratedPremium } from '@/types/premium-types';
import { PremiumPublishError } from './premiumPublishErrors';

const fullName = (o: ShowOfficial) => `${o.firstName} ${o.lastName}`.trim() || null;

/**
 * The premium with its secretary and chairman taken from the officials. An official the show does
 * not have leaves the premium's own value alone. The RPC carries no phone, so a phone the
 * premium already has is kept. The mailing address is the one the club typed for the premium
 * (MYK9-2065); an official without one prints none, never the premium's earlier value.
 */
export function applyOfficialsToPremium(
  premium: GeneratedPremium,
  officials: ShowOfficials
): GeneratedPremium {
  const secretary = officials.secretaries[0];
  const secretaryName = secretary ? fullName(secretary) : null;
  const chair = officials.chairmen[0];
  const chairName = chair ? fullName(chair) : null;
  return {
    ...premium,
    secretary:
      secretary && secretaryName
        ? {
            ...premium.secretary,
            name: secretaryName,
            email: secretary.email,
            mailingAddress: secretary.mailingAddress ?? null,
          }
        : // A secretary no longer listed prints no address: a draft may carry a former volunteer's.
          { ...premium.secretary, mailingAddress: null },
    officials: {
      ...premium.officials,
      chairman:
        chair && chairName
          ? {
              name: chairName,
              email: chair.email,
              phone: premium.officials.chairman?.phone ?? null,
              mailingAddress: chair.mailingAddress ?? null,
            }
          : premium.officials.chairman
            ? { ...premium.officials.chairman, mailingAddress: null }
            : premium.officials.chairman,
    },
  };
}

/** Reads the officials, or fails the publish: a premium is never published with them blank. */
export async function fetchOfficialsForPublish(showId: string): Promise<ShowOfficials> {
  try {
    return await fetchShowOfficials(showId);
  } catch (error) {
    throw new PremiumPublishError(
      "We couldn't read this show's officials, so the premium list wasn't published. Try again.",
      'generation',
      'unknown',
      error
    );
  }
}
