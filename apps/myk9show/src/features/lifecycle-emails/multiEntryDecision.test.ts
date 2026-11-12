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
        trialNumber: 'Trial 4',
        armbandNumber: '12',
        alsoDecided: [
          {
            dogName: 'Rex',
            className: 'Novice Container',
            trialDate: '2026-12-07',
            trialNumber: 'Trial 2',
          },
          {
            dogName: 'Rex',
            className: 'Novice Container',
            trialDate: '2026-12-07',
            trialNumber: 'Trial 1',
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
        trialNumber: 'Trial 1',
        armbandNumber: '12',
        alsoDecided: [
          {
            dogName: 'Bess',
            className: 'Novice Container',
            trialDate: '2026-12-07',
            trialNumber: 'Trial 1',
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

  it('prints a trial name as is and prefixes a bare number', () => {
    expect(
      lines({
        dogName: 'Rex',
        className: 'Buried Novice A',
        trialDate: '2026-12-08',
        trialNumber: 'Trial 4',
        alsoDecided: [
          {
            dogName: 'Rex',
            className: 'Buried Novice A',
            trialDate: '2026-12-08',
            trialNumber: '2',
          },
        ],
      })
    ).toEqual([
      'Your entries for Rex have been accepted for Heartland.',
      'Classes:',
      '- Tue, Dec 8 · Trial 2 · Buried Novice A',
      '- Tue, Dec 8 · Trial 4 · Buried Novice A',
    ]);
  });

  it('sorts trials on the same day by the number inside the trial name', () => {
    const result = lines({
      dogName: 'Rex',
      className: 'Z class',
      trialDate: '2026-12-08',
      trialNumber: 'Trial 1',
      alsoDecided: [
        { dogName: 'Rex', className: 'A class', trialDate: '2026-12-08', trialNumber: 'Trial 2' },
      ],
    });
    expect(result.slice(2)).toEqual([
      '- Tue, Dec 8 · Trial 1 · Z class',
      '- Tue, Dec 8 · Trial 2 · A class',
    ]);
  });
});
