/**
 * UKC Nosework Handler Discrimination setup values (MYK9-1641).
 *
 * Source: docs/rulebooks/ukc-nose-work-rules.txt (UKC Official Nosework Rulebook). Citations
 * are chapter / section:
 *  - Ch. 11 §1 (on leash), §4 (alerts), §6 Novice, §7 Advanced, §8 Excellent, §9 scoring and
 *    time for Novice/Advanced/Excellent, §10 Master (search area, station, boxes, scoring)
 *  - Ch. 2 §4 container boxes and search timing, Ch. 2 §5 cotton gloves and personal articles
 *  - Ch. 3 §1 Handler Discrimination search areas
 * UKC Handler Discrimination has four levels (Novice, Advanced, Excellent, Master), not the
 * five regular Nosework levels, so it has its own column set and level type. Where Ch. 11 is
 * silent for a level the cell says so; nothing is borrowed from AKC.
 */

import type { SetupLevelColumn, SetupPage, SetupRow } from './setupRules.types';
import { UKC_HD_NOTES } from './ukcHandlerDiscriminationSetupNotes';

type UkcHdLevelKey = 'novice' | 'advanced' | 'excellent' | 'master';

export const UKC_HD_LEVEL_COLUMNS: readonly SetupLevelColumn[] = [
  { key: 'novice', label: 'Novice (NHD)' },
  { key: 'advanced', label: 'Advanced (AHD)' },
  { key: 'excellent', label: 'Excellent (EHD)' },
  { key: 'master', label: 'Master (MHD)' },
];

/** Four values in Novice..Master order, keyed by level. */
function perHdLevel(
  novice: string,
  advanced: string,
  excellent: string,
  master: string
): Record<UkcHdLevelKey, string> {
  return { novice, advanced, excellent, master };
}

function row(id: string, label: string, values: Record<UkcHdLevelKey, string>): SetupRow {
  return { id, label, values };
}

const HD_ROWS: readonly SetupRow[] = [
  // Ch. 3 §1 (areas, marking), Ch. 11 §10 (Master station and blank area).
  row(
    'area',
    'Search area',
    perHdLevel(
      'Marked off, at least 40 x 50 ft (2,000 sq ft)',
      'Marked off, at least 40 x 50 ft (2,000 sq ft)',
      'Marked off, at least 40 x 50 ft (2,000 sq ft)',
      'At least 40 x 60 ft (2,400 sq ft), inside or outside. Mark a 60 x 5 ft blank area, a 10 x 10 ft square and a 6 x 4 ft handler station'
    )
  ),
  // Ch. 11 §6-§8, §10; Ch. 3 §1.
  row(
    'layout',
    'Boxes and layout',
    perHdLevel(
      '12 boxes in a straight line down the middle, on the floor or ground, 24 in or more apart',
      '12 boxes in a straight line down the middle, on the floor or ground, 24 in or more apart',
      '12 closed boxes in a row on the floor or ground, 24 in or more apart, marked 1 to 12 at random',
      '12 boxes scattered at random, 10 ft or more from the square and blank area, 6 ft or more from any item or ring edge'
    )
  ),
  // Ch. 2 §4 (container size, taped bottoms), Ch. 11 §10.
  row(
    'box',
    'Box specification',
    perHdLevel(
      'Uniform, at least 12 x 9 in, 3 to 8 in tall, bottoms taped',
      'Uniform, at least 12 x 9 in, 3 to 8 in tall, bottoms taped',
      'Uniform, at least 12 x 9 in, 3 to 8 in tall, bottoms taped',
      '12 x 9 x 3 in, bottom taped, flaps removed or folded in; armband number inside, 1 to 12 outside'
    )
  ),
  // Ch. 11 §6-§8, §10; Ch. 2 §5.
  row(
    'article',
    'Handler article',
    perHdLevel(
      '1 clean cotton glove scented by the handler; the only glove in the class',
      '1 cotton glove scented by the handler',
      '1 cotton glove scented by the handler, brought in a sealed bag marked with the armband number',
      '1 personal item (keys, shoe, sock, shirt), not a glove or undergarment, free of food'
    )
  ),
  // Ch. 11 §6-§8, §10.
  row(
    'prep',
    'Article handling',
    perHdLevel(
      'Handler faces away and drops the glove in a box; judge closes it; judge or steward sets it in line',
      'Steward takes the empty box from the line; handler faces away and drops the glove in it; judge closes it and returns it to the space',
      'No sooner than 15 min before the section, handler takes the glove out of the bag, places glove and bag side by side in an open box, then leaves; no one else touches either',
      'Handlers drop items at prep no sooner than 15 min before the section; steward uses tongs to adjust an item'
    )
  ),
  // Ch. 11 §6-§8 (same position in line), §8, §10 (random).
  row(
    'target',
    'Target position',
    perHdLevel(
      'Same position in line for every target hide',
      'Same position in line for every target hide',
      'Box per handler noted on the score sheet; boxes not moved within the group',
      'Judge decides box placement after the briefing; reset a moved box'
    )
  ),
  // Ch. 11 §6-§8, §10.
  row(
    'other-scents',
    'Other scents',
    perHdLevel(
      'None; the handler glove is the only glove',
      '11 judge-scented cotton gloves, 12 gloves in 12 boxes',
      'If under 12 handlers, stewards or judges scent gloves to fill 12 boxes',
      'If under 12 handlers, judge or steward scented items fill the 12'
    )
  ),
  // Ch. 11 §6-§7 (none); §8 and §10 are silent.
  row(
    'distractions',
    'Distractions',
    perHdLevel(
      'None (no intentional distractions)',
      'None (no intentional distractions)',
      'None stated in Ch. 11 §8',
      'None stated in Ch. 11 §10'
    )
  ),
  // Ch. 11 §1 (on leash), §6-§8, §10.
  row(
    'start',
    'Leash and start',
    perHdLevel(
      'On leash. "Search"; hand sniff only to start and re-cue; no extra scented items',
      'On leash. "Search"; hand sniff only to start and re-cue; no extra scented items',
      'On leash, at the start line. "Search"; hand sniff only to start and re-cue',
      'Hand sniff, then leash off at the station; verbal send only within about 30 sec'
    )
  ),
  // Ch. 11 §9 (N/A/E time), §10 (Master); Ch. 2 §4 (one timer).
  row(
    'time',
    'Time',
    perHdLevel(
      'Not over 3 min; one timer',
      'Not over 3 min; one timer',
      'Not over 3 min; one timer',
      '4 min; timing stops at Alert'
    )
  ),
  // Ch. 11 §4, §7-§10.
  row(
    'calls',
    'Calls',
    perHdLevel(
      'Handler calls Alert; no formal final response required',
      'Handler calls Alert; an incorrect Alert ends the search',
      'Handler calls Alert; an incorrect Alert ends the search',
      'Alert is on the entry form; dog Sits or Downs at the item, then Alert; count "three, two, one, release"'
    )
  ),
];

export const ukcHandlerDiscriminationPage: SetupPage = {
  id: 'handler-discrimination',
  title: 'Handler Discrimination',
  columns: UKC_HD_LEVEL_COLUMNS,
  tableFontPt: 10,
  groups: [{ elementKey: 'hd', title: 'Handler Discrimination', rows: HD_ROWS }],
  notes: UKC_HD_NOTES,
};
