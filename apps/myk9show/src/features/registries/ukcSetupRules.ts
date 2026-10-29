/**
 * UKC Nosework judge setup values (MYK9-1078).
 *
 * Source: docs/rulebooks/ukc-nose-work-rules.txt. Citations are chapter / section:
 *  - Ch. 2 §4: odors, hide-location limits, distractions, hide prep, box size, vehicle heights
 *  - Ch. 3 §1-2: area and element requirements
 *  - Ch. 6-10: per-level requirements (§2 odors and height, §4/§5 elements, §5/§6 time)
 * Maximum element times are the same for every element at a level (Ch. 6 §5 = 3, Ch. 7 §5 = 4,
 * Ch. 8 §6 = 5, Ch. 9 §6 = 6, Ch. 10 §6 = 6), so they sit in the column header.
 * UKC Handler Discrimination (Ch. 11) is out of scope for this card; the shape has room for it.
 */

import type {
  SetupElementGroup,
  SetupLevelColumn,
  SetupNote,
  SetupRow,
  SetupSheet,
} from './setupRules.types';

type UkcLevelKey = 'novice' | 'advanced' | 'superior' | 'master' | 'elite';

/** Five values in Novice..Elite order, keyed by level. */
function perLevel(
  novice: string,
  advanced: string,
  superior: string,
  master: string,
  elite: string
): Record<UkcLevelKey, string> {
  return { novice, advanced, superior, master, elite };
}

function row(id: string, label: string, values: Record<UkcLevelKey, string>): SetupRow {
  return { id, label, values };
}

export const UKC_LEVEL_COLUMNS: readonly SetupLevelColumn[] = [
  { key: 'novice', label: 'Novice', note: 'Max time 3 min' },
  { key: 'advanced', label: 'Advanced', note: 'Max time 4 min' },
  { key: 'superior', label: 'Superior', note: 'Max time 5 min' },
  { key: 'master', label: 'Master', note: 'Max time 6 min' },
  { key: 'elite', label: 'Elite', note: 'Max time 6 min' },
];

// Ch. 6-10 §2 (odors) and Ch. 2 §4 (odor list). Required odor is listed first.
const ODORS = perLevel(
  'Birch',
  'Anise',
  'Clove + Birch or Anise',
  'Myrrh + Birch, Anise or Clove',
  'Vetiver + others allowed'
);

// Ch. 6 §1, Ch. 7 §1, Ch. 8 §1, Ch. 9 §1, Ch. 10 §1.
const HIDES = perLevel('1', '1', '2', '3', '1 to 4, not announced');

// Ch. 6 §1, Ch. 7 §4, Ch. 8 §4, Ch. 9 §4, Ch. 10 §4.
const DISTRACTIONS = perLevel(
  'None',
  '1 toy',
  '1 food or toy',
  '1 food, toy or mimic',
  '2 food, toy, mimic, person'
);

// Ch. 2 §4 hide location limits (Interior and Exterior).
const HIDE_LOCATIONS = perLevel(
  '8 to 12',
  '10 to 14',
  '14 to 20 incl. distractions',
  '16 to 24 incl. distractions',
  '18 to 26 incl. distractions'
);

// Ch. 6-10 §2 (no hide higher than 2, 2, 3, 4, 5 feet).
const MAX_HIDE_HEIGHT = perLevel('2 ft', '2 ft', '3 ft', '4 ft', '5 ft');

const VEHICLES_GROUP: SetupElementGroup = {
  elementKey: 'vehicle',
  title: 'Vehicles',
  rows: [
    row('hides', 'Hides', HIDES),
    row('odors', 'Odors', ODORS),
    // Ch. 6 §4d, 7 §5d, 8 §5d, 9 §5d, 10 §5d.
    row(
      'vehicles',
      'Vehicles',
      perLevel('3 cars', '3 cars', '4 (3 cars + 1 other)', '5 (up to 2 other)', '6 (up to 2 other)')
    ),
    row(
      'layout',
      'Layout',
      perLevel(
        'One line, same direction',
        'One line, same direction',
        'One line, any direction',
        'Scattered, any direction',
        'Scattered, any direction'
      )
    ),
    // Ch. 2 §4 vehicle height limits plus Ch. 6 §2, Ch. 7 §2, Ch. 8 §5d, Ch. 9 §5d, Ch. 10 §5d.
    row(
      'max-height',
      'Max hide height',
      perLevel('2 ft', '2 ft', '3 ft', 'Cars 3 ft, other 4 ft', 'Cars 3 ft, other 5 ft')
    ),
    // Ch. 6 §4d (front bumper), Ch. 7 §5d, Ch. 8 §5d, Ch. 9 §5d, Ch. 10 §5d.
    row(
      'placement',
      'Hide placement',
      perLevel(
        'Front bumper only',
        'Any area of the vehicle',
        '1 hide per vehicle; distraction on another vehicle',
        '1 hide per vehicle; distraction not on its side',
        '1 hide per vehicle; distraction not on its side'
      )
    ),
    row('distractions', 'Distractions', DISTRACTIONS),
  ],
};

const CONTAINERS_GROUP: SetupElementGroup = {
  elementKey: 'container',
  title: 'Containers',
  rows: [
    row('hides', 'Hides', HIDES),
    row('odors', 'Odors', ODORS),
    // Ch. 6 §4a, 7 §5a, 8 §5a, 9 §5a, 10 §5a.
    row('boxes', 'Boxes', perLevel('12', '12', '16', '20', '24')),
    row(
      'layout',
      'Layout',
      perLevel(
        'One straight line',
        'One straight line',
        'No more than 2 rows, evenly spaced',
        'Any arrangement',
        'Any arrangement'
      )
    ),
    // Ch. 3 §1: at least 40 ft x 50 ft for every container search.
    row(
      'area',
      'Search area',
      perLevel(
        '2,000 sq ft min',
        '2,000 sq ft min',
        '2,000 sq ft min',
        '2,000 sq ft min',
        '2,000 sq ft min'
      )
    ),
    row(
      'placement',
      'Hide placement',
      perLevel(
        'No extra rule',
        'No extra rule',
        'Distraction not next to a hide',
        'One hide per box; boxes may touch',
        'One odor per box; boxes may touch'
      )
    ),
    row('distractions', 'Distractions', DISTRACTIONS),
  ],
};

const INTERIOR_GROUP: SetupElementGroup = {
  elementKey: 'interior',
  title: 'Interior',
  rows: [
    row('hides', 'Hides', HIDES),
    row('odors', 'Odors', ODORS),
    // Ch. 6 §4c, 7 §5c, 8 §5c, 9 §5c, 10 §5c.
    row(
      'area',
      'Search areas',
      perLevel(
        '1 area, 100 to 150 sq ft',
        '1 area, 150 to 300 sq ft',
        '2 areas: 100 to 200 and 300 to 400 sq ft',
        '2 areas: 100 to 200 and 300 to 400 sq ft',
        '3 areas: 100 to 200, 300 to 400, 400 to 600 sq ft'
      )
    ),
    row('locations', 'Potential hide locations', HIDE_LOCATIONS),
    row('max-height', 'Max hide height', MAX_HIDE_HEIGHT),
    // Ch. 3 §2 (blank rooms Superior and up), Ch. 8 §5c, Ch. 9 §5c, Ch. 10 §5c.
    row(
      'placement',
      'Placement rules',
      perLevel(
        'No extra rule',
        'No extra rule',
        'Blank area allowed; distraction not next to a hide',
        'Blank area allowed; items may be adjacent',
        'Max 2 items in small area, 3 in larger; any area may be blank'
      )
    ),
    row('distractions', 'Distractions', DISTRACTIONS),
  ],
};

const EXTERIOR_GROUP: SetupElementGroup = {
  elementKey: 'exterior',
  title: 'Exterior',
  rows: [
    row('hides', 'Hides', HIDES),
    row('odors', 'Odors', ODORS),
    // Ch. 6 §4b, 7 §5b, 8 §5b, 9 §5b, 10 §5b.
    row(
      'area',
      'Search area',
      perLevel(
        '200 to 400 sq ft',
        '500 to 750 sq ft',
        '1,000 to 1,500 sq ft',
        '2,000 to 3,000 sq ft',
        '3,000 to 4,000 sq ft'
      )
    ),
    row('locations', 'Potential hide locations', HIDE_LOCATIONS),
    row('max-height', 'Max hide height', MAX_HIDE_HEIGHT),
    row(
      'placement',
      'Placement rules',
      perLevel(
        'No extra rule',
        'No extra rule',
        'Distraction not next to the hide',
        'Items may be adjacent',
        'Items may be adjacent'
      )
    ),
    row('distractions', 'Distractions', DISTRACTIONS),
  ],
};

const VEHICLE_AND_CONTAINER_NOTES: readonly SetupNote[] = [
  {
    heading: 'Vehicles',
    text: 'Search the outside only; the handler never opens a door. Set vehicles 4 to 6 ft apart. A vehicle that held a hide is not reused that weekend. (Ch. 2 §4, Ch. 3 §2)',
  },
  {
    heading: 'Boxes',
    text: 'Uniform cardboard, at least 12 x 9 in and 3 to 8 in tall, bottoms taped, no shipping markings. Boxes at least 24 in apart, rows at least 36 in apart, at least 60 in from ringside barriers; new box when hides change between classes. (Ch. 2 §4, Ch. 3 §1)',
  },
  {
    heading: 'Distractions',
    text: 'Hidden and non-toxic (no chocolate, raisins, grapes, avocado, xylitol); food is contained. Exposed mimic objects from Master, a person other than the judge at Elite. (Ch. 2 §4)',
  },
  {
    heading: 'Hide prep',
    text: 'Made ahead: up to 2 aids per container, 1 drop per swab end. Made the day of: 1 aid, 1 drop. Wait 10 minutes after setting before the Dog In White. Nitrile gloves, no glass receptacles. (Ch. 2 §4)',
  },
];

const INTERIOR_AND_EXTERIOR_NOTES: readonly SetupNote[] = [
  {
    heading: 'Search areas',
    text: 'Odor may be in only one search area unless the class uses several (Superior to Elite Interior). Areas holding odor cannot touch without a barrier. Mark every area. (Ch. 3 §1, §3)',
  },
  {
    heading: 'Hide locations',
    text: 'Superior to Elite counts distractions in the total. Blank rooms or areas are allowed only at Superior, Master and Elite. Use each object or area for a hide once per class in a weekend. (Ch. 2 §4, Ch. 3 §2)',
  },
  {
    heading: 'Interior',
    text: 'The judge decides at the briefing whether everyone searches on leash. The element timer keeps running when handlers change rooms. (Ch. 3 §2, Ch. 8 §5c)',
  },
];

export const ukcSetupSheet: SetupSheet = {
  registryId: 'UKC',
  title: 'UKC Nosework Judge Setup Cheat Sheet',
  edition:
    'Source: UKC Official Nosework Rulebook, Chapters 2, 3, 4 and 6 to 10 (docs/rulebooks/ukc-nose-work-rules.txt)',
  tableFontPt: 11.5,
  pages: [
    {
      id: 'vehicles-containers',
      title: 'Side 1: Vehicles and Containers',
      columns: UKC_LEVEL_COLUMNS,
      groups: [VEHICLES_GROUP, CONTAINERS_GROUP],
      notes: VEHICLE_AND_CONTAINER_NOTES,
    },
    {
      id: 'interior-exterior',
      title: 'Side 2: Interior and Exterior',
      columns: UKC_LEVEL_COLUMNS,
      groups: [INTERIOR_GROUP, EXTERIOR_GROUP],
      notes: INTERIOR_AND_EXTERIOR_NOTES,
    },
  ],
};
