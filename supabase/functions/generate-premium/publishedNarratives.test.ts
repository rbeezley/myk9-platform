import { describe, expect, it } from 'vitest';
import { completeNarratives, publishedNarratives } from './publishedNarratives';

describe('publishedNarratives', () => {
  it('returns the published narratives', () => {
    expect(
      publishedNarratives({
        style: 'magazine',
        narratives: { showHours: 'Saturday 8 to 5.', trialInformation: 'Two trials.' },
      })
    ).toEqual({ showHours: 'Saturday 8 to 5.', trialInformation: 'Two trials.' });
  });

  it('returns empty narratives when nothing is published', () => {
    expect(publishedNarratives({})).toEqual({ showHours: '', trialInformation: '' });
    expect(publishedNarratives(null)).toEqual({ showHours: '', trialInformation: '' });
    expect(publishedNarratives(undefined)).toEqual({ showHours: '', trialInformation: '' });
  });

  it.each([
    { name: 'a string', content: 'oops' },
    { name: 'an array', content: [] },
    { name: 'narratives as a string', content: { narratives: 'text' } },
    { name: 'narratives as an array', content: { narratives: ['a'] } },
    {
      name: 'non-string fields',
      content: { narratives: { showHours: 5, trialInformation: { a: 1 } } },
    },
  ])('returns empty narratives for malformed jsonb: $name', ({ content }) => {
    expect(publishedNarratives(content)).toEqual({ showHours: '', trialInformation: '' });
  });

  it('drops the legacy placeholder strings and keeps the other field', () => {
    expect(
      publishedNarratives({
        narratives: {
          showHours: 'Show hours to be announced.',
          trialInformation: 'Real trial information.',
        },
      })
    ).toEqual({ showHours: '', trialInformation: 'Real trial information.' });
  });
});

describe('completeNarratives', () => {
  const published = { showHours: 'Published hours.', trialInformation: 'Published info.' };

  it('keeps a complete model answer as is', () => {
    expect(
      completeNarratives({ showHours: 'New hours.', trialInformation: 'New info.' }, published)
    ).toEqual({
      narratives: { showHours: 'New hours.', trialInformation: 'New info.' },
      incomplete: false,
    });
  });

  it('fills a blank section from the published text and marks the answer incomplete', () => {
    expect(
      completeNarratives({ showHours: 'New hours.', trialInformation: '  ' }, published)
    ).toEqual({
      narratives: { showHours: 'New hours.', trialInformation: 'Published info.' },
      incomplete: true,
    });
  });

  it('leaves a section blank when nothing was ever published', () => {
    expect(
      completeNarratives(
        { showHours: '', trialInformation: 'New info.' },
        { showHours: '', trialInformation: '' }
      )
    ).toEqual({
      narratives: { showHours: '', trialInformation: 'New info.' },
      incomplete: true,
    });
  });
});

describe('completeNarratives with a placeholder answer', () => {
  it('treats a legacy placeholder from the model as blank and keeps the published text', () => {
    expect(
      completeNarratives(
        { showHours: 'Show hours to be announced.', trialInformation: 'New info.' },
        { showHours: 'Published hours.', trialInformation: 'Published info.' }
      )
    ).toEqual({
      narratives: { showHours: 'Published hours.', trialInformation: 'New info.' },
      incomplete: true,
    });
  });
});
