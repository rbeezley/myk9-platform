/**
 * AKC Scent Work judge setup values (MYK9-1078).
 *
 * Source: docs/rulebooks/akc-scent-work-regulations.txt (Amended August 2025):
 *  - Ch. 7 §2 odors, §3 proximity, §4 Container, §5 Interior, §6 Exterior, §7 Buried
 *    (class text and the summary table at the end of each element)
 *  - Ch. 5 §4-§9 hide prep, placement and reuse, §11 containers, §12 rows, §24 distractions
 * Times vary by element here, so they sit in each element's rows. Hide height and
 * accessibility apply to Interior and Exterior only. The Detective class is out of scope;
 * the shape has room for it.
 */

import {
  AKC_LEVEL_COLUMNS,
  akcHandlerDiscriminationPage,
  perAkcLevel,
} from './akcHandlerDiscriminationSetupRules';
import type { SetupElementGroup, SetupNote, SetupRow, SetupSheet } from './setupRules.types';

function row(id: string, label: string, values: ReturnType<typeof perAkcLevel>): SetupRow {
  return { id, label, values };
}

// Ch. 7 §2: Novice Birch only; each level adds an odor.
const ODORS = perAkcLevel(
  'Birch',
  'Birch and/or Anise',
  'Birch, Anise and/or Clove',
  'Birch, Anise, Clove and/or Cypress'
);

// Ch. 7 §4-§7 distractions by level (Ch. 5 §24 defines each type).
const DISTRACTIONS = perAkcLevel(
  'None',
  '1 non-food',
  '2: non-food, food, auditory or visual',
  '3: non-food, food, auditory, visual, human or mimic'
);

const CONTAINER_GROUP: SetupElementGroup = {
  elementKey: 'container',
  title: 'Containers',
  rows: [
    // Ch. 7 §4 class text and summary table.
    row(
      'hides',
      'Hides',
      perAkcLevel('1, known', '2, known', '3, known', '1 to 3, number not announced')
    ),
    row('odors', 'Odors', ODORS),
    row('containers', 'Containers', perAkcLevel('10', '15', '20', '20')),
    row(
      'container-type',
      'Container type',
      perAkcLevel(
        'Identical cardboard boxes',
        'Various size and type',
        'Various size and type',
        'Various size and type'
      )
    ),
    row(
      'layout',
      'Layout',
      perAkcLevel(
        '2 rows of 5',
        '3 rows of 5, circle or U',
        '4 rows of 5, circle or U',
        '4 rows of 5, circle or U'
      )
    ),
    row(
      'spacing',
      'Spacing',
      perAkcLevel(
        'at least 12 in apart, rows at least 36 in apart',
        'at least 12 in apart, rows at least 36 in apart',
        'at least 12 in apart, rows at least 36 in apart',
        'at least 12 in apart, rows at least 36 in apart'
      )
    ),
    row(
      'area',
      'Search area',
      perAkcLevel('250 to 400 sq ft', '400 to 600 sq ft', '600 to 800 sq ft', '600 to 800 sq ft')
    ),
    row('time', 'Time', perAkcLevel('2 minutes', '2 minutes', '3 minutes', '4 minutes')),
    row('distractions', 'Distractions', DISTRACTIONS),
    row(
      'calls',
      'Calls',
      perAkcLevel(
        'Alert',
        '2 Alerts, then Finish',
        '3 Alerts, then Finish',
        'Alert for each find, then Finish'
      )
    ),
  ],
};

const BURIED_GROUP: SetupElementGroup = {
  elementKey: 'buried',
  title: 'Buried',
  rows: [
    // Ch. 7 §7 class text and summary table. Advanced is water per the class text.
    row(
      'hides',
      'Hides',
      perAkcLevel('1, known', '2, known', '3, known', '1 to 4, number not announced')
    ),
    row('odors', 'Odors', ODORS),
    row('totes', 'Totes', perAkcLevel('6', '8', '12', '16')),
    row(
      'fill',
      'Fill',
      perAkcLevel(
        'All sand (2 to 3 in, vessel covered by at least 1 in)',
        'All water (vessel covered by 4 in)',
        '6 sand and 6 water',
        '8 sand and 8 water'
      )
    ),
    row(
      'layout',
      'Layout',
      perAkcLevel('2 rows of 3', 'Any arrangement', 'Any arrangement', 'Any arrangement')
    ),
    row(
      'spacing',
      'Spacing',
      perAkcLevel(
        'at least 36 in apart',
        'at least 36 in apart',
        'at least 36 in apart',
        'at least 36 in apart'
      )
    ),
    row(
      'area',
      'Search area',
      perAkcLevel('150 to 200 sq ft', '200 to 400 sq ft', '300 to 400 sq ft', '400 to 500 sq ft')
    ),
    row('time', 'Time', perAkcLevel('2 minutes', '3 minutes', '4 minutes', '5 minutes')),
    row('distractions', 'Distractions', DISTRACTIONS),
    row(
      'calls',
      'Calls',
      perAkcLevel(
        'Alert',
        '2 Alerts, then Finish',
        '3 Alerts, then Finish',
        'Alert for each find, then Finish'
      )
    ),
  ],
};

const INTERIOR_GROUP: SetupElementGroup = {
  elementKey: 'interior',
  title: 'Interior',
  rows: [
    // Ch. 7 §5 class text and summary table.
    row(
      'hides',
      'Hides',
      perAkcLevel(
        '1, known',
        '2, known',
        '3, known (split not announced)',
        '0 to 3 per area, 2 to 6 per class'
      )
    ),
    row('odors', 'Odors', ODORS),
    row(
      'area',
      'Search area',
      perAkcLevel(
        '1 area, 100 to 200 sq ft',
        '1 area, 200 to 400 sq ft',
        '2 areas, 400 to 800 sq ft total',
        '3 areas, 600 to 1,000 sq ft total'
      )
    ),
    row(
      'time',
      'Time',
      perAkcLevel(
        'Judge sets, 1 to 3 min',
        'Judge sets, 1 to 3 min',
        'Judge sets, 1 to 3 min per area',
        'Judge sets, 1 to 3 min per area'
      )
    ),
    row('max-height', 'Max hide height', perAkcLevel('24 in', '36 in', '48 in', '60 in')),
    row(
      'accessibility',
      'Accessibility',
      perAkcLevel(
        'Accessible only',
        'Accessible only',
        '1 hide may be inaccessible',
        'All hides may be inaccessible'
      )
    ),
    row('distractions', 'Distractions', DISTRACTIONS),
    row(
      'calls',
      'Calls',
      perAkcLevel(
        'Alert',
        '2 Alerts, then Finish',
        '3 Alerts, Finish in each area',
        'Alert for each find, Finish in each area'
      )
    ),
    row(
      'placement',
      'Placement rules',
      perAkcLevel(
        'No extra rule',
        'No extra rule',
        'Areas 30 ft apart or barrier; not a split room',
        'Same rule; 1 area may be blank if it never held a hide this weekend'
      )
    ),
  ],
};

const EXTERIOR_GROUP: SetupElementGroup = {
  elementKey: 'exterior',
  title: 'Exterior',
  rows: [
    // Ch. 7 §6 class text and summary table.
    row(
      'hides',
      'Hides',
      perAkcLevel('1, known', '2, known', '3, known', '1 to 4, number not announced')
    ),
    row('odors', 'Odors', ODORS),
    row(
      'area',
      'Search area',
      perAkcLevel(
        '200 to 400 sq ft',
        '400 to 800 sq ft',
        '800 to 1,500 sq ft',
        '1,500 to 2,000 sq ft'
      )
    ),
    row(
      'time',
      'Time',
      perAkcLevel(
        'Judge sets, 2 to 4 min',
        'Judge sets, 2 to 4 min',
        'Judge sets, 3 to 5 min',
        'Judge sets, 3 to 5 min'
      )
    ),
    row('max-height', 'Max hide height', perAkcLevel('24 in', '36 in', '48 in', '60 in')),
    row(
      'accessibility',
      'Accessibility',
      perAkcLevel(
        'Accessible only',
        'Accessible only',
        '1 hide may be inaccessible',
        'All hides may be inaccessible'
      )
    ),
    row('distractions', 'Distractions', DISTRACTIONS),
    row(
      'calls',
      'Calls',
      perAkcLevel(
        'Alert',
        '2 Alerts, then Finish',
        '3 Alerts, then Finish',
        'Alert for each find, then Finish'
      )
    ),
  ],
};

const CONTAINERS_AND_BURIED_NOTES: readonly SetupNote[] = [
  {
    heading: 'Containers',
    text: 'Novice boxes are identical cardboard, at least 10 x 8 in and 3 to 8 in tall. Rows are parallel straight lines, not offset, with the start line at the short end. Use no more than 5 of any identical container type. Always keep a visual barrier from other search areas, and stay at least 20 ft from an active search area unless a physical barrier separates them. (Ch. 5 §11-§12, Ch. 7 §3-§4)',
  },
  {
    heading: 'Buried',
    text: 'Totes about 16 x 11 x 7 in with latching handles and a metal grid. Play sand and drinking-quality water only. Sand vessel is a stainless mesh tea ball, 1 to 2 in. Water boxes each hold a vessel on the bottom, covered by 4 in of water. At some levels a distraction may not be buried or submerged. (Ch. 5 §24, Ch. 7 §7)',
  },
  {
    heading: 'Distractions',
    text: 'Not on top of a hide or a past hide spot. In Container and Buried they may sit in a container but never with the odor. Food must be enclosed so it cannot be eaten. Tell handlers the number and type, not the place. (Ch. 5 §24)',
  },
  {
    heading: 'Hide prep',
    text: 'One scent aid (cotton ball or paper-stem swab) per vessel, one vessel per hide, 2 drops of one odor. Glass for storage only; no glass vessels. Same hide spot for every team in a class. If a hide must move mid-class, wipe the old spot with 1 part white vinegar to 3 parts water and wait 10 minutes before the next dog. (Ch. 5 §4-§5, §8-§9)',
  },
];

const INTERIOR_AND_EXTERIOR_NOTES: readonly SetupNote[] = [
  {
    heading: 'Interior',
    text: 'Four solid walls to the ground and a roof; no screened porches or tents. Mark any part of a room left out. Active interior areas stay 30 ft apart unless a barrier separates them. (Ch. 7 §3, §5)',
  },
  {
    heading: 'Exterior',
    text: 'Natural airflow, no more than two solid walls. Mark boundaries with tape, flags or gates. Active exterior areas stay 30 ft apart unless a barrier separates them. (Ch. 7 §3, §6)',
  },
  {
    heading: 'Placing hides',
    text: 'Never on a boundary marker such as a cone or flag; a natural wall that bounds the area may hold one. One search area takes no more than 7 interior or exterior hides in a set of trials. (Ch. 5 §6-§7)',
  },
  {
    heading: 'Between classes',
    text: 'Move the scent between classes; let it stand 10 minutes before the first dog in the new class. (Ch. 5 §8)',
  },
];

export const akcSetupSheet: SetupSheet = {
  registryId: 'AKC',
  title: 'AKC Scent Work Judge Setup Cheat Sheet',
  edition:
    'Source: Regulations for AKC Scent Work, Amended August 2025, Chapters 5, 7 and 8 (docs/rulebooks/akc-scent-work-regulations.txt)',
  tableFontPt: 11,
  pages: [
    {
      id: 'containers-buried',
      title: 'Page 1: Containers and Buried',
      columns: AKC_LEVEL_COLUMNS,
      groups: [CONTAINER_GROUP, BURIED_GROUP],
      notes: CONTAINERS_AND_BURIED_NOTES,
    },
    {
      id: 'interior-exterior',
      title: 'Page 2: Interior and Exterior',
      columns: AKC_LEVEL_COLUMNS,
      groups: [INTERIOR_GROUP, EXTERIOR_GROUP],
      notes: INTERIOR_AND_EXTERIOR_NOTES,
    },
    {
      ...akcHandlerDiscriminationPage,
      title: 'Page 3: Handler Discrimination (print single-sided)',
    },
  ],
};
