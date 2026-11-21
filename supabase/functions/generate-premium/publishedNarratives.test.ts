import { describe, expect, it } from 'vitest';
import { publishedNarratives } from './publishedNarratives';

const EMPTY = { showHours: '', trialInformation: '' };
const PUBLISHED = { showHours: 'Saturday 8 to 5.', trialInformation: 'Two trials.' };

describe('publishedNarratives', () => {
  it('returns the published narratives when the snapshot was built for the show organization', () => {
    expect(
      publishedNarratives({ org: 'AKC', style: 'magazine', narratives: PUBLISHED }, 'AKC')
    ).toEqual(PUBLISHED);
  });

  // MYK9-2216: a Regenerate after an organization change writes fresh text.
  it.each([
    { name: 'built for another organization', content: { org: 'AKC', narratives: PUBLISHED } },
    { name: 'published before snapshots recorded it', content: { narratives: PUBLISHED } },
    { name: 'a null org', content: { org: null, narratives: PUBLISHED } },
  ])('carries nothing over from a snapshot $name', ({ content }) => {
    expect(publishedNarratives(content, 'UKC')).toEqual(EMPTY);
  });

  it('carries nothing over when the show has no organization', () => {
    expect(publishedNarratives({ org: 'AKC', narratives: PUBLISHED }, null)).toEqual(EMPTY);
  });

  it('returns empty narratives when nothing is published', () => {
    expect(publishedNarratives({}, 'AKC')).toEqual(EMPTY);
    expect(publishedNarratives(null, 'AKC')).toEqual(EMPTY);
    expect(publishedNarratives(undefined, 'AKC')).toEqual(EMPTY);
  });

  it.each([
    { name: 'a string', content: 'oops' },
    { name: 'an array', content: [] },
    { name: 'narratives as a string', content: { org: 'AKC', narratives: 'text' } },
    { name: 'narratives as an array', content: { org: 'AKC', narratives: ['a'] } },
    {
      name: 'non-string fields',
      content: { org: 'AKC', narratives: { showHours: 5, trialInformation: { a: 1 } } },
    },
  ])('returns empty narratives for malformed jsonb: $name', ({ content }) => {
    expect(publishedNarratives(content, 'AKC')).toEqual(EMPTY);
  });

  it('drops the legacy placeholder strings and keeps the other field', () => {
    expect(
      publishedNarratives(
        {
          org: 'AKC',
          narratives: {
            showHours: 'Show hours to be announced.',
            trialInformation: 'Real trial information.',
          },
        },
        'AKC'
      )
    ).toEqual({ showHours: '', trialInformation: 'Real trial information.' });
  });
});
