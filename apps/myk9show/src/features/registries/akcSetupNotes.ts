/**
 * AKC Scent Work judge setup footer notes (MYK9-1078).
 *
 * Every note is a set of verbatim excerpts from docs/rulebooks/akc-scent-work-regulations.txt,
 * each with its chapter and section. Nothing here is paraphrased: the guard test in
 * __tests__/setupNotes.test.ts fails when a quote is not in the rulebook.
 */

import type { SetupNote } from './setupRules.types';

export const AKC_CONTAINERS_AND_BURIED_NOTES: readonly SetupNote[] = [
  {
    heading: 'Containers',
    excerpts: [
      {
        quote:
          'Novice cardboard boxes must be of uniform size and shall be at least 10-inches long by 8-inches wide; they must be no less than 3-inches and no more than 8-inches tall.',
        cite: 'Ch. 5 §11',
      },
      {
        quote:
          'Classes that specify a “variety” of containers shall utilize no more than 5 of any identical container type.',
        cite: 'Ch. 7 §4',
      },
      {
        quote:
          'Container search areas, whether or not odor is present, may be no nearer than 20 feet from an active search area without a physical barrier.',
        cite: 'Ch. 7 §3',
      },
    ],
  },
  {
    heading: 'Buried',
    excerpts: [
      {
        quote:
          'must be approximately 16 inches wide by 11 inches deep by 7 inches high (up to 2 inches smaller or larger is permissible)',
        cite: 'Ch. 7 §7',
      },
      {
        quote: 'Classes that utilize sand must only use “play sand.”',
        cite: 'Ch. 7 §7',
      },
    ],
  },
  {
    heading: 'Distractions',
    excerpts: [
      {
        quote:
          'Distraction items cannot be placed on top of the hide, or on top of the location of a previous hide.',
        cite: 'Ch. 5 §24',
      },
      {
        quote:
          'Whenever a food distraction is used it must be enclosed within a container such that a searching dog would be unable to consume the food',
        cite: 'Ch. 5 §24',
      },
      {
        quote:
          'For Container and Buried classes, the distraction may be in a container or loose in the search area. If in a container, it may NOT be in the same container as the odor.',
        cite: 'Ch. 5 §24',
      },
    ],
  },
  {
    heading: 'Hide prep',
    excerpts: [
      {
        quote:
          'two (2) drops of the oil should be applied directly to the cotton ball or cotton swab (both drops must be from the same odor)',
        cite: 'Ch. 5 §4',
      },
      {
        quote: 'Glass must always be used for scent preparation and storage',
        cite: 'Ch. 5 §4',
      },
      {
        quote: 'Due to safety concerns, scent vessels may never contain glass.',
        cite: 'Ch. 5 §5',
      },
    ],
  },
];

export const AKC_INTERIOR_AND_EXTERIOR_NOTES: readonly SetupNote[] = [
  {
    heading: 'Interior',
    excerpts: [
      {
        quote: 'it must have four solid walls that reach all the way to the ground, and a roof',
        cite: 'Ch. 7 §5',
      },
      {
        quote:
          'Improper areas for an interior search include screened in porches, tents, or sheds where the siding does not reach the ground.',
        cite: 'Ch. 7 §5',
      },
      {
        quote:
          '“Active” interior search areas may be no nearer than 30 feet from another active search area without a physical barrier.',
        cite: 'Ch. 7 §3',
      },
    ],
  },
  {
    heading: 'Exterior',
    excerpts: [
      {
        quote: 'The search may be in a covered area but should have no more than two solid walls.',
        cite: 'Ch. 7 §6',
      },
      {
        quote:
          '“Active” exterior search areas may be no nearer than 30 feet from another active search area without a physical barrier.',
        cite: 'Ch. 7 §3',
      },
    ],
  },
  {
    heading: 'Physical barrier',
    excerpts: [
      {
        quote:
          'A physical barrier is either an object that is solid and flush with the ground, or two rows of hanging tarps/curtains that reach the ground with at least one foot of space between them.',
        cite: 'Ch. 5 §2',
      },
      {
        quote: 'Physical barriers must be at least five (5) feet in height.',
        cite: 'Ch. 5 §2',
      },
    ],
  },
  {
    heading: 'Placing hides',
    excerpts: [
      {
        quote:
          'The hide may never be placed on or inside an object that is put in the search area to denote the boundary (such as a cone or flag).',
        cite: 'Ch. 5 §7',
      },
      {
        quote:
          'the hide may be placed on a wall or structure that is natural to the search area and is used as the outer limit of the search area',
        cite: 'Ch. 5 §7',
      },
      {
        quote:
          'the same search area cannot be used for more than 7 interior, exterior, or detective hides during an entire set of trials',
        cite: 'Ch. 5 §6',
      },
    ],
  },
  {
    heading: 'Between classes',
    excerpts: [
      {
        quote:
          'Scent must be relocated between classes, but must be left to stand for 10 minutes before the first dog in the new class begins.',
        cite: 'Ch. 5 §8',
      },
    ],
  },
];
