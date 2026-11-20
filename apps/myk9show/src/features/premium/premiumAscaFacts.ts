import type { GeneratedPremium } from '@/types/premium-types';

type PremiumShow = GeneratedPremium['show'];

/** A fixed statement the registry requires the premium to print, in the registry's words. */
export interface PremiumRegistryStatementFact {
  label: string;
  text: string;
}

const SANCTION_TEXT = { pending: 'Pending', approved: 'Approved' } as const;

const SPECTATOR_TEXT = {
  // ASCA §1.8.15: search-area access is the judge's call, and recording needs the handler's
  // permission (no flash), so "allowed" is never printed as blanket permission.
  allowed:
    "Spectators are welcome; entry to the search areas is at the judge's discretion. Photographs and video of a dog's search only with the handler's permission, and no flash.",
  not_allowed: 'Spectators and videoing are not allowed.',
} as const;

/**
 * MYK9-2290 (ASCA §1.5.2, §1.5.9, §1.5.19, §1.5.24): the show-level facts typed on the show.
 * Each prints only when set, in every style; an empty fact adds no line and no placeholder (an
 * older premium generated before the columns carries none of them).
 */
export function buildShowTermFacts(show: {
  [K in 'ascaSanctionStatus' | 'scentsByLevel' | 'spectatorsPolicy' | 'photographerContact']?:
    PremiumShow[K] | undefined;
}): PremiumRegistryStatementFact[] {
  const facts: PremiumRegistryStatementFact[] = [];
  const status = show.ascaSanctionStatus;
  if (status === 'pending' || status === 'approved') {
    facts.push({ label: 'Sanctioning status', text: SANCTION_TEXT[status] });
  }
  const scents = show.scentsByLevel?.trim();
  if (scents) facts.push({ label: 'Scents used for each level', text: scents });
  const policy = show.spectatorsPolicy;
  if (policy === 'allowed' || policy === 'not_allowed') {
    facts.push({ label: 'Spectators and videoing', text: SPECTATOR_TEXT[policy] });
  }
  const photographer = show.photographerContact?.trim();
  if (photographer) facts.push({ label: 'Show photographer', text: photographer });
  return facts;
}

/**
 * MYK9-2291 (ASCA §1.5.18, §1.5.22): the club-level facts typed once on the club's premium
 * template. Each prints only when set, in every style; an empty one adds no line.
 */
export function buildClubTermFacts(
  supplemental: GeneratedPremium['supplemental'] | null | undefined
): PremiumRegistryStatementFact[] {
  const facts: PremiumRegistryStatementFact[] = [];
  const mobility = supplemental?.limitedMobilityNotes?.trim();
  if (mobility) facts.push({ label: 'Limited mobility access', text: mobility });
  const rv = supplemental?.rvHookupNotes?.trim();
  if (rv) facts.push({ label: 'RV hook-ups', text: rv });
  return facts;
}
