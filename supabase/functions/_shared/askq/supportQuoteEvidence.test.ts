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
      'bold link code hi there'
    );
  });
});

describe('verifySupportAnswerQuotes tolerance', () => {
  const ID = 'judge-steward-quickstart';
  const STEP_QUOTE =
    'Tap Start when the dog begins. Tap Stop when the dog finishes or time is called.';
  const STEP_ANSWER =
    'SUPPORT_ANSWER\nTap Start when the dog begins, then tap Stop when time is called.';

  it('accepts bold markers', () => {
    const result = verify(
      '**SUPPORT_ANSWER**',
      'Time each area, then tap the Record button for that area.',
      `**SUPPORT_QUOTE** [${ID}]: "${GOOD_QUOTE}"`
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a bullet quote line, inline answer text, and a missing colon', () => {
    const result = verify(
      'SUPPORT_ANSWER: Time each area, then tap the Record button for that area.',
      `- SUPPORT_QUOTE [${ID}] "${GOOD_QUOTE}"`
    );
    expect(result).toMatchObject({
      ok: true,
      answerText: 'Time each area, then tap the Record button for that area.',
    });
  });

  it('accepts a period or ").": after the closing quote, and CRLF', () => {
    for (const tail of ['.', ').']) {
      const text = [ANSWER, `SUPPORT_QUOTE [${ID}]: "${GOOD_QUOTE}"${tail}`].join('\r\n');
      expect(verifySupportAnswerQuotes(text, ASKQ_GUIDES).ok).toBe(true);
    }
  });

  it('accepts a quote spanning a step-number boundary written inline', () => {
    const result = verify(
      STEP_ANSWER,
      quoteLine(ID, '2. Tap Start when the dog begins. 3. Tap Stop when the dog finishes')
    );
    expect(result.ok).toBe(true);
    expect(verify(STEP_ANSWER, quoteLine(ID, STEP_QUOTE)).ok).toBe(true);
  });

  it('accepts curly quotes, dashes and a .md id', () => {
    const result = verify(
      ANSWER,
      quoteLine(
        `${ID}.md`,
        'Tap **Record Area 1 time** (then Record Area 2 time, and so on; the button names the area)'
      )
    );
    expect(result.ok).toBe(true);
    expect(verify(ANSWER, `SUPPORT_QUOTE [${ID}]: “${GOOD_QUOTE}”`).ok).toBe(true);
  });

  it('allows inner double quotes, taking the first open to the last close', () => {
    const result = verify(
      'SUPPORT_ANSWER\nAn area showing dashes was not recorded, so tap Cancel and fix it.',
      quoteLine(ID, 'An area showing "--" was not recorded: tap Cancel and fix it.')
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a quote that starts or ends mid-word', () => {
    expect(
      verify(ANSWER, quoteLine(ID, 'ap Record Area 1 time (then Record Area 2 time, and so on')).ok
    ).toBe(false);
    expect(
      verify(ANSWER, quoteLine(ID, 'Tap Record Area 1 time (then Record Area 2 time, and so o')).ok
    ).toBe(false);
  });

  it('rejects an invented answer backed by an unrelated real guide sentence', () => {
    const result = verify(
      'SUPPORT_ANSWER\nOpen Settings, choose Billing, and upgrade your membership plan for free.',
      quoteLine(
        ID,
        'Find the trial secretary at the show desk. They control access codes, the run order, and results.'
      )
    );
    expect(result).toEqual({ ok: false, reason: 'quote_rejected' });
  });

  it('accepts a real answer that paraphrases its quote', () => {
    const result = verify(
      'SUPPORT_ANSWER\nAsk the trial secretary at the show desk; they control access codes.',
      quoteLine(
        ID,
        'Find the trial secretary at the show desk. They control access codes, the run order, and results.'
      )
    );
    expect(result.ok).toBe(true);
  });

  it('reports handoff for a handoff, no marker, or SUPPORT_HANDOFF inside the body', () => {
    expect(verify('SUPPORT_HANDOFF\nI need to get a person to help with that.')).toEqual({
      ok: false,
      reason: 'handoff',
    });
    expect(verify('Just text')).toEqual({ ok: false, reason: 'handoff' });
    expect(verify(ANSWER, 'SUPPORT_HANDOFF', quoteLine(ID, GOOD_QUOTE))).toEqual({
      ok: false,
      reason: 'handoff',
    });
  });

  it('reports quote_rejected when the answer has no verified quote', () => {
    expect(verify(ANSWER)).toEqual({ ok: false, reason: 'quote_rejected' });
  });

  it('never leaves a marker string in an accepted answer', () => {
    const result = verify(
      '**SUPPORT_ANSWER**',
      'Time each area, SUPPORT_ANSWER then tap the Record button SUPPORT_QUOTE for that area.',
      quoteLine(ID, GOOD_QUOTE)
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.answerText).not.toMatch(/SUPPORT_/);
  });
});
