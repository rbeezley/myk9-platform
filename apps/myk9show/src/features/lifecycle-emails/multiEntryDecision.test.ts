import { describe, expect, it } from 'vitest';
import { buildMultiEntryDecisionLines } from './multiEntryDecision';

const accepted = { verb: 'have been accepted for', withArmbands: true };

const lines = (entry: Parameters<typeof buildMultiEntryDecisionLines>[0]) =>
  buildMultiEntryDecisionLines(entry, 'Heartland', accepted).filter(Boolean) as string[];

describe('buildMultiEntryDecisionLines (MYK9-1800)', () => {
  it('lists every class on its own line with its day and trial, in schedule order', () => {
    expect(
      lines({
        dogName: 'Rex',
        className: 'Novice Container',
        trialDate: '2026-12-08',
        trialNumber: '4',
        armbandNumber: '12',
        alsoDecided: [
          {
            dogName: 'Rex',
            className: 'Novice Container',
            trialDate: '2026-12-07',
            trialNumber: '2',
          },
          {
            dogName: 'Rex',
            className: 'Novice Container',
            trialDate: '2026-12-07',
            trialNumber: '1',
          },
        ],
      })
    ).toEqual([
      'Your entries for Rex have been accepted for Heartland.',
      'Classes:',
      '- Mon, Dec 7 · Trial 1 · Novice Container',
      '- Mon, Dec 7 · Trial 2 · Novice Container',
      '- Tue, Dec 8 · Trial 4 · Novice Container',
      'Armband: 12',
    ]);
  });

  it('names the dog on each line, and each dog’s armband, when the form has several dogs', () => {
    expect(
      lines({
        dogName: 'Rex',
        className: 'Novice Interior',
        trialDate: '2026-12-07',
        trialNumber: '1',
        armbandNumber: '12',
        alsoDecided: [
          {
            dogName: 'Bess',
            className: 'Novice Container',
            trialDate: '2026-12-07',
            trialNumber: '1',
            armbandNumber: '14',
          },
        ],
      })
    ).toEqual([
      'Your entries for Bess and Rex have been accepted for Heartland.',
      'Classes:',
      '- Bess: Mon, Dec 7 · Trial 1 · Novice Container',
      '- Rex: Mon, Dec 7 · Trial 1 · Novice Interior',
      'Armbands: Bess 14, Rex 12',
    ]);
  });

  it('still lists a class whose day and trial are unknown', () => {
    expect(
      lines({
        dogName: 'Rex',
        className: 'Novice A',
        alsoDecided: [{ dogName: 'Rex', className: 'Novice B' }],
      })
    ).toContain('- Novice A');
  });
});
