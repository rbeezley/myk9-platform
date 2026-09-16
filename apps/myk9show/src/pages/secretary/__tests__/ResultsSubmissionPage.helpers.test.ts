import { describe, expect, it } from 'vitest';
import { buildAKCSubmissionReadiness } from '../ResultsSubmissionPage/helpers';
import type { UnmappableAKCClass } from '@myk9/secretary';

function unmappable(overrides: Partial<UnmappableAKCClass> = {}): UnmappableAKCClass {
  return {
    classId: 'class-1',
    className: 'Detective',
    element: 'Unknown',
    level: 'Unknown',
    section: null,
    ...overrides,
  };
}

describe('buildAKCSubmissionReadiness', () => {
  it('returns one blocked verdict when registration numbers are missing', () => {
    expect(
      buildAKCSubmissionReadiness({
        entryCount: 21,
        missingRegistrationNumberCount: 21,
      })
    ).toEqual({
      verdict: '21 entries need AKC registration numbers before sending.',
      details:
        'You can still download a draft XML file, but Send to AKC stays disabled until the missing registration numbers are added.',
      canSend: false,
    });
  });

  // MYK9-323 — AKC has no "not scored yet" code, so an unscored dog can only
  // go out as NQ. Sending must be blocked until every entry carries a result.
  it('blocks sending while any entry has no result recorded', () => {
    expect(
      buildAKCSubmissionReadiness({
        entryCount: 21,
        missingRegistrationNumberCount: 0,
        unscoredEntryCount: 3,
      })
    ).toEqual({
      verdict: '3 entries have no result recorded yet.',
      details:
        'AKC has no code for an unscored run, so these would be submitted as NQ. Record a result (or mark the dog absent, excused, or withdrawn) for each one before sending.',
      canSend: false,
    });
  });

  it('singularises the unscored-entry verdict', () => {
    expect(
      buildAKCSubmissionReadiness({
        entryCount: 21,
        missingRegistrationNumberCount: 0,
        unscoredEntryCount: 1,
      }).verdict
    ).toBe('1 entry has no result recorded yet.');
  });

  it('returns a ready verdict only when nothing blocks sending', () => {
    expect(
      buildAKCSubmissionReadiness({
        entryCount: 21,
        missingRegistrationNumberCount: 0,
        unscoredEntryCount: 0,
      })
    ).toEqual({
      verdict: '21 entries are ready to send to AKC.',
      details: 'Submission file is ready to send or download.',
      canSend: true,
    });
  });
  // MYK9-547 — the highest-priority branch. A class AKC has no code for used to
  // ship as Novice A; now nothing ships, and not even a draft can be built, so
  // this outranks every other blocker.
  describe('a class with no AKC class code', () => {
    it('names the class and its stored element/level/section', () => {
      const result = buildAKCSubmissionReadiness({
        entryCount: 4,
        missingRegistrationNumberCount: 0,
        unscoredEntryCount: 0,
        unmappableClasses: [unmappable()],
      });
      expect(result.canSend).toBe(false);
      expect(result.verdict).toBe(
        'One class is not set up as an AKC class: Detective (element "Unknown", level "Unknown").'
      );
      // The remedy, in secretary vocabulary — the class edit form shows these
      // three fields read-only, so "check the class setup" would go nowhere.
      // Names the real gesture, surface by surface: Classes -> Add Classes ->
      // Create Classes -> Select Template -> Choose Classes.
      expect(result.details).toContain('Delete this class, then add it again: go to Classes');
      expect(result.details).toContain('choose Add Classes');
      expect(result.details).toContain('on Create Classes pick the AKC template');
      expect(result.details).toContain('under Select Template');
      expect(result.details).toContain('tick the class under Choose Classes');
      expect(result.details).toContain('move those entries to another class first');
      expect(result.details).not.toMatch(/class code|contact support/i);
    });

    it('includes the section when the class carries one', () => {
      expect(
        buildAKCSubmissionReadiness({
          entryCount: 4,
          missingRegistrationNumberCount: 0,
          unmappableClasses: [
            unmappable({
              className: 'Vehicle Novice A',
              element: 'Vehicle',
              level: 'Novice',
              section: 'A',
            }),
          ],
        }).verdict
      ).toBe(
        'One class is not set up as an AKC class: Vehicle Novice A (element "Vehicle", level "Novice", section "A").'
      );
    });

    it('says "no element" / "no level" rather than printing an empty quote', () => {
      expect(
        buildAKCSubmissionReadiness({
          entryCount: 4,
          missingRegistrationNumberCount: 0,
          unmappableClasses: [unmappable({ className: 'Class 1', element: '', level: '' })],
        }).verdict
      ).toBe('One class is not set up as an AKC class: Class 1 (no element, no level).');
    });

    it('pluralises and lists every class', () => {
      const result = buildAKCSubmissionReadiness({
        entryCount: 9,
        missingRegistrationNumberCount: 0,
        unmappableClasses: [
          unmappable(),
          unmappable({
            classId: 'class-2',
            className: 'Vehicle Novice A',
            element: 'Vehicle',
            level: 'Novice',
            section: 'A',
          }),
        ],
      });
      expect(result.verdict).toBe(
        '2 classes are not set up as AKC classes: Detective (element "Unknown", level "Unknown"); ' +
          'Vehicle Novice A (element "Vehicle", level "Novice", section "A").'
      );
      expect(result.details).toContain('Delete these classes, then add them again: go to Classes');
      expect(result.details).toContain('tick each class under Choose Classes');
    });

    it('outranks the no-entries verdict', () => {
      expect(
        buildAKCSubmissionReadiness({
          entryCount: 0,
          missingRegistrationNumberCount: 0,
          unmappableClasses: [unmappable()],
        }).verdict
      ).toContain('not set up as an AKC class');
    });

    it('outranks missing registration numbers and unscored entries', () => {
      expect(
        buildAKCSubmissionReadiness({
          entryCount: 21,
          missingRegistrationNumberCount: 21,
          unscoredEntryCount: 3,
          unmappableClasses: [unmappable()],
        }).verdict
      ).toContain('not set up as an AKC class');
    });

    it('does not fire for an empty list', () => {
      expect(
        buildAKCSubmissionReadiness({
          entryCount: 21,
          missingRegistrationNumberCount: 0,
          unscoredEntryCount: 0,
          unmappableClasses: [],
        }).canSend
      ).toBe(true);
    });
  });
});
