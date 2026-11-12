import { describe, expect, it } from 'vitest';
import { buildMultiEntryDecisionLines } from './multiEntryDecision';

const accepted = { verb: 'have been accepted for', withArmbands: true };

describe('buildMultiEntryDecisionLines (MYK9-1800)', () => {
  it('lists the same class entered on two days twice, each with its day', () => {
    const lines = buildMultiEntryDecisionLines(
      {
        dogName: 'Rex',
        className: 'Novice Container',
        trialDate: '2026-12-07',
        armbandNumber: '12',
        alsoDecided: [{ dogName: 'Rex', className: 'Novice Container', trialDate: '2026-12-08' }],
      },
      'Heartland',
      accepted
    ).join('\n');

    expect(lines).toContain('Novice Container (Mon, Dec 7), Novice Container (Tue, Dec 8)');
  });

  it('keeps different classes plain, without days', () => {
    const lines = buildMultiEntryDecisionLines(
      {
        dogName: 'Rex',
        className: 'Novice Container',
        trialDate: '2026-12-07',
        alsoDecided: [{ dogName: 'Rex', className: 'Novice Interior', trialDate: '2026-12-07' }],
      },
      'Heartland',
      accepted
    ).join('\n');

    expect(lines).toContain('Novice Container, Novice Interior');
    expect(lines).not.toContain('Dec 7');
  });
});
