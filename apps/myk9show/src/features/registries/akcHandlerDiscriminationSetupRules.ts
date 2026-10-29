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
    excerpts: [
      {
        quote:
          'For classes in the Handler Discrimination division, the judge must designate another individual to set the hides for them (the Hide Steward).',
        cite: 'Ch. 5 §30',
      },
      {
        quote:
          'The hide steward will be responsible for hiding the handler-scented article and will wear latex, nitrile, or vinyl gloves while doing so.',
        cite: 'Ch. 8 §7',
      },
    ],
  },
  {
    heading: 'Handler waits out of sight',
    excerpts: [
      {
        quote:
          'The handler will then retreat to a location blocked by a wall or partition while the scented article is placed on the course.',
        cite: 'Ch. 8 §7',
      },
      {
        quote: 'The handler-scented article may not be enclosed in a scent vessel.',
        cite: 'Ch. 8 §7',
      },
      {
        quote:
          'The sealed plastic bag will then be returned to the handler before he or she leaves the search area.',
        cite: 'Ch. 8 §9',
      },
    ],
  },
  {
    heading: 'Novice boxes',
    excerpts: [
      {
        quote:
          'The club shall provide one container per handler, and no container used for a handler’s scent can be subsequently re-used.',
        cite: 'Ch. 8 §10',
      },
      {
        quote:
          'When setting the course, the container with the handler’s scent will replace an empty container.',
        cite: 'Ch. 8 §10',
      },
      {
        quote:
          'When returning the scented article to the handler, the empty container will be returned to the space so that there are always 10 containers in the search area.',
        cite: 'Ch. 8 §10',
      },
      {
        quote:
          'Novice cardboard boxes must be of uniform size and shall be at least 10-inches long by 8-inches wide; they must be no less than 3-inches and no more than 8-inches tall.',
        cite: 'Ch. 5 §11',
      },
    ],
  },
  {
    heading: 'Handler cueing',
    excerpts: [
      {
        quote:
          'Handlers may use an additional scented article to cue the dog to search for their scent.',
        cite: 'Ch. 8 §8',
      },
      {
        quote:
          'This can be done on the start line and can also be done at any time during the class, if the handler wishes.',
        cite: 'Ch. 8 §8',
      },
      {
        quote:
          'the scented article may be placed in a different location for each team, even within the same class, and there is no minimum time required for the handler scent to be left to stand before the team searches',
        cite: 'Ch. 5 §8',
      },
    ],
  },
];

export const akcHandlerDiscriminationPage: SetupPage = {
  id: 'handler-discrimination',
  title: 'Handler Discrimination',
  columns: AKC_LEVEL_COLUMNS,
  // Sparse page: prints larger than the two dense pages.
  tableFontPt: 13,
  groups: [{ elementKey: 'hd', title: 'Handler Discrimination', rows: HD_ROWS }],
  notes: HD_NOTES,
};
