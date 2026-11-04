/**
 * UKC Nosework Handler Discrimination footer notes (MYK9-1641).
 *
 * Verbatim excerpts from docs/rulebooks/ukc-nose-work-rules.txt with chapter and section;
 * the guard test in __tests__/setupNotes.test.ts fails when a quote is not in the rulebook.
 */

import type { SetupNote } from './setupRules.types';

export const UKC_HD_NOTES: readonly SetupNote[] = [
  {
    heading: 'Stewards',
    excerpts: [
      {
        quote:
          'When hosting any Handler Discrimination and/or container trials, one steward should be designated for the care of the odor box.',
        cite: 'Ch. 2 §4',
      },
      {
        quote:
          'One box will be needed for each exhibitor in addition to the required number of boxes for this class.',
        cite: 'Ch. 11 §6',
      },
    ],
  },
  {
    heading: 'Articles',
    excerpts: [
      {
        quote: 'Gloves used in HD classes must be made of cotton and may be of any color.',
        cite: 'Ch. 2 §5',
      },
    ],
  },
  {
    heading: 'Master station',
    excerpts: [
      {
        quote:
          'If the dog is having trouble, the handler may recall the dog to the handler’s station one time without penalty.',
        cite: 'Ch. 11 §10',
      },
      {
        quote: 'The handler may not recall and resend the dog more than two times.',
        cite: 'Ch. 11 §10',
      },
    ],
  },
];
