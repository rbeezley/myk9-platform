import { describe, expect, it } from 'vitest';
import { ASKQ_GUIDES } from './documentAssets.ts';
import { normalizeQuoteText, verifySupportAnswerQuotes } from './supportQuoteEvidence.ts';

const GOOD_QUOTE =
  'Tap Record Area 1 time (then Record Area 2 time, and so on; the button names the area).';
const ANSWER = 'SUPPORT_ANSWER\nTime each area, then tap the Record button for that area.';
const quoteLine = (id: string, quote: string) => `SUPPORT_QUOTE [${id}]: "${quote}"`;
const verify = (...lines: string[]) => verifySupportAnswerQuotes(lines.join('\n'), ASKQ_GUIDES);

describe('verifySupportAnswerQuotes', () => {
  it('accepts a real quote and strips the marker and quote lines', () => {
    const result = verify(ANSWER, quoteLine('judge-steward-quickstart', GOOD_QUOTE));
    expect(result).toEqual({
      ok: true,
      answerText: 'Time each area, then tap the Record button for that area.',
      guideSources: [
        {
          id: 'judge-steward-quickstart',
          title: expect.any(String),
          audience: expect.any(String),
          quote: GOOD_QUOTE,
          content: GOOD_QUOTE,
        },
      ],
    });
  });

  it('verifies a quote that keeps the markdown bold from the source', () => {
    const result = verify(
      ANSWER,
      quoteLine(
        'judge-steward-quickstart',
        'Tap **Record Area 1 time** (then Record Area 2 time, and so on; the button names the area).'
      )
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a paraphrased quote', () => {
    expect(
      verify(
        ANSWER,
        quoteLine(
          'judge-steward-quickstart',
          'Press the record button for each area after you stop the timer for that area.'
        )
      ).ok
    ).toBe(false);
  });

  it('rejects a quote under 8 words', () => {
    expect(verify(ANSWER, quoteLine('judge-steward-quickstart', 'Record Area 1 time')).ok).toBe(
      false
    );
  });

  it('rejects an unknown guide id', () => {
    expect(verify(ANSWER, quoteLine('no-such-guide', GOOD_QUOTE)).ok).toBe(false);
  });

  it('rejects the whole answer when one of two quotes is fabricated', () => {
    expect(
      verify(
        ANSWER,
        quoteLine('judge-steward-quickstart', GOOD_QUOTE),
        quoteLine(
          'judge-steward-quickstart',
          'Every area time is saved automatically when you stop.'
        )
      ).ok
    ).toBe(false);
  });

  it('rejects a quote real in a different guide than the one named', () => {
    const other = ASKQ_GUIDES.find(g => g.id !== 'judge-steward-quickstart');
    expect(other).toBeDefined();
    expect(verify(ANSWER, quoteLine(other!.id, GOOD_QUOTE)).ok).toBe(false);
  });

  it('rejects an answer with no quote, without the marker, or a handoff', () => {
    expect(verify(ANSWER).ok).toBe(false);
    expect(verify(quoteLine('judge-steward-quickstart', GOOD_QUOTE)).ok).toBe(false);
    expect(verify('SUPPORT_HANDOFF\nI need to get a person to help with that.').ok).toBe(false);
  });
});

describe('normalizeQuoteText', () => {
  it('flattens markdown, curly punctuation, case and whitespace', () => {
    expect(normalizeQuoteText('> - **Bold** [link](http://x.y) `code`\n“Hi” — _there_')).toBe(
      'bold link code "hi" - there'
    );
  });
});
