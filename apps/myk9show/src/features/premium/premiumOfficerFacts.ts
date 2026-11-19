import {
  OFFICER_POSITION_LABELS,
  OFFICER_POSITION_ORDER,
  type OfficerPosition,
} from '@/types/club-membership-types';

/** One line of the club's officers: "Club secretary: Sam Typed". */
export interface PremiumOfficerFact {
  title: string;
  name: string;
}

/**
 * MYK9-2045: the club's officers as "Title: Name" facts in the Officers list's own position
 * order (president first), ties by name so the order is stable. A title is a label only; it
 * grants nothing. Empty (nothing printed, never a placeholder) when the club lists none.
 */
export function buildOfficerFacts(
  officers: ReadonlyArray<{ position: string; name: string }> | null | undefined
): PremiumOfficerFact[] {
  const rank = (position: string) => OFFICER_POSITION_ORDER.indexOf(position as OfficerPosition);
  return (officers ?? [])
    .map(o => ({ position: o.position, name: o.name.trim() }))
    .filter(o => o.name && rank(o.position) >= 0)
    .sort((a, b) => rank(a.position) - rank(b.position) || a.name.localeCompare(b.name))
    .map(o => ({ title: OFFICER_POSITION_LABELS[o.position as OfficerPosition], name: o.name }));
}

/**
 * MYK9-2064: the Event Committee as trimmed names in the list's own order. Empty (nothing
 * printed, never a placeholder) when the club and the show list none.
 */
export function buildCommitteeFacts(names: ReadonlyArray<string> | null | undefined): string[] {
  return (names ?? []).map(name => name.trim()).filter(Boolean);
}
