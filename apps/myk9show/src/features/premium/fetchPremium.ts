import { supabase } from '../../services/database/supabaseClient';
import type { GeneratedPremium } from '../../types/premium-types';
import { fetchShowClubOfficers } from '@/services/database/club-memberships/officers';
import { fetchShowCommittee } from '@/services/database/club-memberships/committee';
import { applyOfficialsToPremium, fetchOfficialsForPublish } from './premiumOfficials';
import { classifyPremiumFunctionError } from './premiumPublishErrors';
import { parseGeneratedPremium } from './premiumPublishSchema';

const GENERATION_FAILURE_MESSAGE = "We couldn't generate the premium list. Please try again.";

/**
 * One call to generate-premium and everything the client adds to its answer: the show's current
 * facts, with the narratives built from them (MYK9-2055; no model call), except a narrative
 * already published, which is kept.
 */
export async function fetchPremium(showId: string): Promise<GeneratedPremium> {
  const { data, error: fnError } = await supabase.functions.invoke('generate-premium', {
    body: { show_id: showId },
  });
  if (fnError) {
    console.error('[premium-generation] request failed', { showId, error: fnError });
    const classified = await classifyPremiumFunctionError(fnError, 'generation');
    if (classified.code === 'unknown') {
      throw new Error(GENERATION_FAILURE_MESSAGE);
    }
    throw classified;
  }
  try {
    const premium = parseGeneratedPremium(data);
    // MYK9-2045: the club's Officers list rides along with the generated facts. A failed
    // read prints no officers rather than blocking the premium; the next generation retries.
    const officers = await fetchShowClubOfficers(showId);
    if (!officers) console.error('[premium-generation] officers read failed', { showId });
    // MYK9-2064: so does the Event Committee (the show's own list, else the club's), with
    // the same failure rule.
    const committee = await fetchShowCommittee(showId);
    if (!committee) console.error('[premium-generation] committee read failed', { showId });
    // MYK9-2053: the secretary and chair live in show_officials; the function reads user_roles.
    // An unreadable read fails the publish rather than printing a blank.
    const withOfficials = applyOfficialsToPremium(premium, await fetchOfficialsForPublish(showId));
    return {
      ...withOfficials,
      ...(officers ? { officers } : {}),
      ...(committee ? { committee } : {}),
    };
  } catch (error) {
    console.error('[premium-generation] invalid response shape', { showId, error });
    throw error;
  }
}

/** The show's current facts (MYK9-2244), the same call every premium surface uses. */
export function fetchPremiumFacts(showId: string): Promise<GeneratedPremium> {
  return fetchPremium(showId);
}
