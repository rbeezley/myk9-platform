/**
 * NQ and Excused reasons per registry, and the reason a result starts with
 * (MYK9-2008). One list per registry so every sheet offers the same words.
 *
 * Sources, all in docs/rulebooks/:
 * - AKC: the lists the AKC Scent Work sheet has always offered.
 * - UKC: ukc-nose-work-rules.txt, Chapter 3 Section 10 (non-qualifying faults and
 *   Excused), Section 9 (control and aggression), Section 11 (poor sportsmanship,
 *   double handling), eligibility (lame, ill, in season), and the Code of Conduct
 *   (reactive dogs). "Fault Limit" is the class rule "more than one fault";
 *   "Handler Error" covers the handler-conduct NQs (a kicked box, directing the
 *   dog, stepping out of the area, too many restarts).
 * - ASCA: asca-scent-detection-rules.txt, 9.2 (non-qualifying faults) and 9.3
 *   (Excusal). In ASCA a dog that eliminates is an NQ (9.2.1), not an excusal.
 *   "Fault Limit" is each level's fault cap (5.5.2, 6.5.2, 7.5.1, 8.5.2); "False
 *   Alert" is a false alert in the first area (7.8E, 8.8E).
 */

import type { ExtendedResult, ScoresheetSportType } from '../types/scoreData';

type ReasonRegistry = 'AKC' | 'UKC' | 'ASCA';

function registryOf(sportType?: ScoresheetSportType): ReasonRegistry {
  if (sportType === 'UKC_NOSEWORK') return 'UKC';
  if (sportType === 'ASCA_SCENT_DETECTION') return 'ASCA';
  return 'AKC';
}

// "Max Time" is the reason the timer writes, so every list carries those words.
const NQ_REASONS: Record<ReasonRegistry, readonly string[]> = {
  AKC: [
    'Incorrect Call',
    'Max Time',
    'Point to Hide',
    'Harsh Correction',
    'Significant Disruption',
  ],
  UKC: [
    'Incorrect Call',
    'Max Time',
    'Fault Limit',
    'False Alert',
    'Prior to Alert',
    'Missed Indication',
    'Handler Stopped Search',
    'Handler Error',
  ],
  ASCA: [
    'Incorrect Call',
    'Max Time',
    'Dog Eliminated in Area',
    'Dog Stopped Working',
    'Destroyed Containers',
    'Excessive Disturbance',
    'Damaged Property',
    "Couldn't Point to Hide",
    'Fault Limit',
    'False Alert',
  ],
};

const EXCUSED_REASONS: Record<ReasonRegistry, readonly string[]> = {
  AKC: ['Dog Eliminated in Area', 'Handler Request', 'Out of Control', 'Overly Stressed', 'Other'],
  UKC: [
    'Dog Eliminated in Area',
    'Handler Request',
    'Out of Control',
    'Aggression',
    'Reactive Dog',
    'Stress or Fear',
    'Lame, Ill or in Season',
    'Poor Sportsmanship',
    'Double Handling',
  ],
  ASCA: [
    'Extreme Stress/Fear/Aggression',
    'Harsh Handling',
    'Poor Sportsmanship',
    'Revealed Hide Location',
  ],
};

// UKC and ASCA start an Excused with no reason, and the sheet will not save one
// until the judge picks: each reason is a judgement, and a pre-chosen "Dog
// Eliminated in Area" would record a false elimination for a reactive dog.
const EXCUSED_DEFAULT: Record<ReasonRegistry, string> = {
  AKC: 'Dog Eliminated in Area',
  UKC: '',
  ASCA: '',
};

export function nqReasonsFor(sportType?: ScoresheetSportType): readonly string[] {
  return NQ_REASONS[registryOf(sportType)];
}

export function excusedReasonsFor(sportType?: ScoresheetSportType): readonly string[] {
  return EXCUSED_REASONS[registryOf(sportType)];
}

/**
 * The reason a result starts with when the judge taps it. "Incorrect Call" stays
 * chosen in advance for an NQ (owner decision, plan-judge-at-the-ring.md). A tap
 * on the result already chosen must not call this: the reason it has stays.
 */
export function startingReasonFor(
  sportType: ScoresheetSportType | undefined,
  result: ExtendedResult
): string {
  if (result === 'NQ') return 'Incorrect Call';
  if (result === 'ABS') return 'Absent';
  if (result === 'EX') return EXCUSED_DEFAULT[registryOf(sportType)];
  return '';
}
