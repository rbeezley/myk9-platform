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

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

type DraftContact = { name: string | null; email: string | null; phone: string | null };

/**
 * The draft's phone, only when the draft contact is the current holder (MYK9-2204): generate-premium
 * reads the holder's phone at generation time, but the officials read carries none and a draft
 * contact has no person id. Same person = equal non-empty emails; with an email missing on either
 * side, equal non-empty full names. A replaced holder, or identity that cannot be established, gets
 * no phone, never the predecessor's.
 */
function phoneForHolder(draft: DraftContact | null, holder: ShowOfficial, name: string) {
  if (!draft?.phone) return null;
  const draftEmail = norm(draft.email);
  const holderEmail = norm(holder.email);
  if (draftEmail && holderEmail) return draftEmail === holderEmail ? draft.phone : null;
  const draftName = norm(draft.name);
  return draftName && draftName === norm(name) ? draft.phone : null;
}

/**
 * The premium with its secretary and chairman taken from the officials, which were read
 * successfully (a failed read throws in `fetchOfficialsForPublish` and never reaches here). A role
 * with no holder is cleared whole: a draft's former volunteer prints nothing. The RPC carries no
 * phone, so a draft phone is kept only for the same person (see `phoneForHolder`, MYK9-2204). The mailing address is the one the club typed for the premium
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
            phone: phoneForHolder(premium.secretary, secretary, secretaryName),
            mailingAddress: secretary.mailingAddress ?? null,
          }
        : // The lookup succeeded and nobody holds the role: a draft's former volunteer must not
          // print, so the whole contact goes, not just the address.
          { name: null, email: null, phone: null, mailingAddress: null },
    officials: {
      ...premium.officials,
      chairman:
        chair && chairName
          ? {
              name: chairName,
              email: chair.email,
              phone: phoneForHolder(premium.officials.chairman, chair, chairName),
              mailingAddress: chair.mailingAddress ?? null,
            }
          : null,
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
