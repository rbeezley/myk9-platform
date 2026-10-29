/**
 * AKC Scent Work Handler Discrimination setup values (MYK9-1078).
 *
 * Source: docs/rulebooks/akc-scent-work-regulations.txt (Amended August 2025):
 * Ch. 8 §2-§14 (articles, hide steward, per-level classes, summary table) and Ch. 5 §11
 * (Novice boxes). The page is its own single-sided card.
 */

import type { SetupLevelColumn, SetupNote, SetupPage, SetupRow } from './setupRules.types';

export const AKC_LEVEL_COLUMNS: readonly SetupLevelColumn[] = [
  { key: 'novice', label: 'Novice' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'excellent', label: 'Excellent' },
  { key: 'master', label: 'Master' },
];

type AkcLevelKey = 'novice' | 'advanced' | 'excellent' | 'master';

/** Four values in Novice..Master order, keyed by level. */
export function perAkcLevel(
  novice: string,
  advanced: string,
  excellent: string,
  master: string
): Record<AkcLevelKey, string> {
  return { novice, advanced, excellent, master };
}

function row(id: string, label: string, values: Record<AkcLevelKey, string>): SetupRow {
  return { id, label, values };
}

const HD_ROWS: readonly SetupRow[] = [
  // Ch. 8 §11-§14.
  row(
    'search-type',
    'Search type',
    perAkcLevel('Container', 'Interior', 'Exterior', 'Combined: 2 or more elements in one search')
  ),
  row(
    'area',
    'Search area',
    perAkcLevel(
      '250 to 400 sq ft',
      '150 to 400 sq ft',
      '400 to 600 sq ft',
      '2 areas, 300 to 800 sq ft total'
    )
  ),
  // Ch. 8 §10-§11 (Novice), §12-§14.
  row(
    'setup',
    'Setup',
    perAkcLevel(
      '10 identical cardboard boxes, 2 rows of 5, boxes at least 12 in apart, rows at least 36 in apart; nothing else in the area',
      'One room or part of a room',
      'One outdoor area',
      'Areas worked one at a time; no blank area; handler scent never buried'
    )
  ),
  // Ch. 8 §2, §11-§14.
  row(
    'handler-hides',
    'Handler hides and article',
    perAkcLevel(
      '1 hide: cotton glove or sock',
      '1 hide: cotton ball or swab',
      '1 hide: cotton ball or swab',
      '3 hides: cotton ball or swab'
    )
  ),
  row(
    'other-scents',
    'Other scents on course',
    perAkcLevel(
      '1 judge-scented article (in a box)',
      '1 judge-scented aid',
      '1 judge-scented aid',
      '1 judge-scented aid and 1 steward-scented aid'
    )
  ),
  row(
    'max-height',
    'Hide height',
    perAkcLevel(
      'On the floor, inside a box',
      'Accessible, 24 in max',
      'Accessible, 24 in max',
      'Accessible, 24 in max'
    )
  ),
  row(
    'distractions',
    'Distractions',
    perAkcLevel(
      'None',
      'None',
      '1 non-food',
      '1 or 2: non-food, food, visual, auditory, human or mimic'
    )
  ),
  row(
    'time',
    'Time',
    perAkcLevel(
      '2 minutes',
      'Judge sets, 2 to 5 min',
      'Judge sets, 3 to 6 min',
      'Judge sets, 2 to 3 min per area'
    )
  ),
  row(
    'calls',
    'Calls',
    perAkcLevel('Alert', 'Alert', 'Alert', 'Alert for each find; Finish in each area')
  ),
];

const HD_NOTES: readonly SetupNote[] = [
  {
    heading: 'Hide steward',
    text: 'The judge never sets Handler Discrimination hides; the judge designates a hide steward. The steward wears latex, nitrile or vinyl gloves, takes the handler article in its plastic bag, hides it where the judge chooses, then calls the team to the start line. (Ch. 5 §30, Ch. 8 §7)',
  },
  {
    heading: 'Handler waits out of sight',
    text: 'The handler waits behind a wall or partition while the article is placed. The article is taped or stuck on, never inside a scent vessel, and goes back to the handler in its sealed bag after the search. (Ch. 8 §7, §9)',
  },
  {
    heading: 'Novice boxes',
    text: 'The club supplies one box per handler. The box with the handler scent replaces an empty box, is never reused for another handler, and an empty box goes back so 10 boxes are always on the floor. Boxes are at least 10 x 8 in and 3 to 8 in tall. (Ch. 5 §11, Ch. 8 §10)',
  },
  {
    heading: 'Handler cueing',
    text: 'Handlers may use an extra scented article to cue the dog at the start line or at any time in the search. The hide can be in a new place for every team, and there is no waiting time for the handler scent. (Ch. 5 §8, Ch. 8 §8)',
  },
];

export const akcHandlerDiscriminationPage: SetupPage = {
  id: 'handler-discrimination',
  title: 'Handler Discrimination',
  columns: AKC_LEVEL_COLUMNS,
  // Sparse page: prints larger than the two dense pages.
  tableFontPt: 13.5,
  groups: [{ elementKey: 'hd', title: 'Handler Discrimination', rows: HD_ROWS }],
  notes: HD_NOTES,
};
