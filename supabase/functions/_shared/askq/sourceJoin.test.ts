// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  joinSourceSections,
  NEEDS_SHOW_SENTENCE,
  NO_GUIDE_ANSWER_SENTENCE,
  SHOW_DATA_LABEL,
} from './sourceJoin.ts';

describe('joinSourceSections', () => {
  it('reads one source as its own answer, unlabelled', () => {
    expect(joinSourceSections([{ source: 'show_data', text: 'Class is running.' }])).toBe(
      'Class is running.'
    );
  });

  it('joins several in the fixed order, labelling show data', () => {
    const text = joinSourceSections([
      { source: 'rulebook', text: 'Using AKC Scent Work rules:\nYes.' },
      { source: 'guides', text: 'From the Exhibitor Guide:\n“Step.”' },
      { source: 'show_data', text: 'Ring 2.' },
    ]);
    expect(text).toBe(
      `${SHOW_DATA_LABEL}\nRing 2.\n\nFrom the Exhibitor Guide:\n“Step.”\n\nUsing AKC Scent Work rules:\nYes.`
    );
  });

  it('gives a source that produced nothing one plain sentence', () => {
    const text = joinSourceSections([
      { source: 'guides', text: null },
      { source: 'rulebook', text: 'Using AKC rules:\nYes.' },
    ]);
    expect(text).toBe(`${NO_GUIDE_ANSWER_SENTENCE}\n\nUsing AKC rules:\nYes.`);
    expect(joinSourceSections([{ source: 'guides', text: '  ' }])).toBe(NO_GUIDE_ANSWER_SENTENCE);
  });

  it('words the needs-a-show sentence plainly', () => {
    expect(NEEDS_SHOW_SENTENCE).not.toMatch(/[\u2014\u2013]|mode|tab/i);
    expect(joinSourceSections([{ source: 'show_data', text: NEEDS_SHOW_SENTENCE }])).toBe(
      NEEDS_SHOW_SENTENCE
    );
  });
});
