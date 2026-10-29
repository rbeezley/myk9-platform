/**
 * UKC Nosework judge setup footer notes (MYK9-1078).
 *
 * Every note is a set of verbatim excerpts from docs/rulebooks/ukc-nose-work-rules.txt, each
 * with its chapter and section. Nothing here is paraphrased: the guard test in
 * __tests__/setupNotes.test.ts fails when a quote is not in the rulebook.
 */

import type { SetupNote } from './setupRules.types';

export const UKC_VEHICLE_AND_CONTAINER_NOTES: readonly SetupNote[] = [
  {
    heading: 'Vehicles',
    excerpts: [
      {
        quote: 'The search will only be done on the exterior of any vehicle.',
        cite: 'Ch. 3 §2',
      },
      {
        quote:
          'The vehicles must be no less than four (4) feet and no more than six (6) feet apart',
        cite: 'Ch. 6 §4d, Ch. 7 §5d (same rule Ch. 8 to 10 §5d)',
      },
      {
        quote:
          'Once a vehicle has held a hide for any class, it may no longer be used on that weekend.',
        cite: 'Ch. 2 §4',
      },
    ],
  },
  {
    heading: 'Boxes',
    excerpts: [
      {
        quote:
          'Containers must be at least 12 inches by 9 inches with any container not being less than three (3) inches tall or over eight (8) inches tall.',
        cite: 'Ch. 2 §4',
      },
      {
        quote:
          'There must be a minimum of three feet (36 inches) between rows and at least five feet (60 inches) from the edge of the ringside barriers.',
        cite: 'Ch. 3 §1',
      },
    ],
  },
  {
    heading: 'Distractions',
    excerpts: [
      {
        quote:
          'All food and toy distractions must be hidden so the handler does not know where the distraction is located.',
        cite: 'Ch. 2 §4',
      },
      {
        quote:
          'Toys, food and/or other materials used for distractions must be specifically non-toxic to dogs',
        cite: 'Ch. 2 §4',
      },
      {
        quote:
          'When food is used as a distraction, the food must be contained so that the dog cannot eat it.',
        cite: 'Ch. 2 §4',
      },
    ],
  },
  {
    heading: 'Hide prep',
    excerpts: [
      {
        quote:
          'no more than 2 aids (each end of the cotton swab is considered 1 aid) will be allowed in any hide container for any search',
        cite: 'Ch. 2 §4',
      },
      {
        quote:
          'Hides prepared the day of the trial will be limited to 1 aid, (1 end of the cotton swab) allowed in any hide container for any search',
        cite: 'Ch. 2 §4',
      },
      {
        quote:
          'All aids, once set in the search area, must have a wait time of at least 10 minutes once set prior to the Dog In White (DIW), and the first dog running the class.',
        cite: 'Ch. 2 §4',
      },
    ],
  },
];

export const UKC_INTERIOR_AND_EXTERIOR_NOTES: readonly SetupNote[] = [
  {
    heading: 'Search areas',
    excerpts: [
      {
        quote: 'Search areas cannot be adjacent to one other if odor has been placed in each area.',
        cite: 'Ch. 3 §3',
      },
      { quote: 'odor can only be present in one search area', cite: 'Ch. 3 §3' },
      {
        quote:
          'The only exceptions are the Superior, Master, and Elite Interior searches that require more than one search area within that class',
        cite: 'Ch. 3 §3',
      },
      {
        quote:
          'must be marked off as the designated search areas with traffic cones, caution tape, ring gates etc.',
        cite: 'Ch. 3 §1',
      },
    ],
  },
  {
    heading: 'Hide locations',
    excerpts: [
      {
        quote: 'Blank rooms / areas can only be presented in Superior, Master, and Elite classes.',
        cite: 'Ch. 3 §2',
      },
      {
        quote:
          'All objects and vehicles used for placing hides for an Interior, an Exterior or a Vehicle search may only be used once in a class, during a trial weekend',
        cite: 'Ch. 2 §4',
      },
    ],
  },
  {
    heading: 'Interior',
    excerpts: [
      {
        quote:
          'During the Handlers Briefing, the Judge will determine if the search must be completed with the dog on leash or if they will allow the handler to choose to complete the search off leash.',
        cite: 'Ch. 3 §2',
      },
      {
        quote: 'The Element timer will remain running when changing rooms.',
        cite: 'Ch. 8 §5c',
      },
    ],
  },
];
