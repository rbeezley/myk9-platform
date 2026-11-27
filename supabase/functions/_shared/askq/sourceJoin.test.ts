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
      { source: 'guides', text: 'From the Exhibitor Guide:\n“Tap Enter.”' },
      { source: 'rulebook', text: null },
    ]);
    expect(text).toBe(
      'From the Exhibitor Guide:\n“Tap Enter.”\n\nI could not find that in the official rulebook.'
    );
    expect(joinSourceSections([{ source: 'guides', text: '  ' }])).toBe(NO_GUIDE_ANSWER_SENTENCE);
  });

  it("never prints the no-guide-answer sentence beside another source's answer (MYK9-2473)", () => {
    // Production, 2026-11-26: "I could not find a verified guide answer for that question."
    // followed by a rulebook answer, in one reply.
    expect(
      joinSourceSections([
        { source: 'guides', text: null },
        { source: 'rulebook', text: 'Using AKC rules:\nYes.' },
      ])
    ).toBe('Using AKC rules:\nYes.');
    // Show data alone is then one source, so it reads as its own answer with no label.
    expect(
      joinSourceSections([
        { source: 'show_data', text: 'Withdrawn: 2.' },
        { source: 'guides', text: null },
      ])
    ).toBe('Withdrawn: 2.');
    // With no other answer, the sentence is still the reply.
    expect(
      joinSourceSections([
        { source: 'guides', text: null },
        { source: 'rulebook', text: null },
      ])
    ).toBe(`${NO_GUIDE_ANSWER_SENTENCE}\n\nI could not find that in the official rulebook.`);
  });

  it('words the needs-a-show sentence plainly', () => {
    expect(NEEDS_SHOW_SENTENCE).not.toMatch(/[\u2014\u2013]|mode|tab/i);
    expect(joinSourceSections([{ source: 'show_data', text: NEEDS_SHOW_SENTENCE }])).toBe(
      NEEDS_SHOW_SENTENCE
    );
  });
});
