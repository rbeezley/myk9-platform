import { describe, expect, it } from 'vitest';
import { stripPlaceholderNarratives } from '../premiumNarratives';

describe('stripPlaceholderNarratives', () => {
  it('blanks legacy placeholder text and keeps real narratives', () => {
    expect(
      stripPlaceholderNarratives({
        showHours: 'Show hours to be announced.',
        trialInformation: 'Two trials.',
      })
    ).toEqual({ showHours: '', trialInformation: 'Two trials.' });
  });
});
