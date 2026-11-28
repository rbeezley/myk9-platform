import { describe, expect, it } from 'vitest';
import { ASKQ_GUIDES } from './documentAssets.ts';
import {
  normalizeQuoteText,
  tokenizeQuoteText,
  verifySupportAnswerQuotes,
} from './supportQuoteEvidence.ts';

const GOOD_QUOTE = "Before you tap Save, check that every area's field has a time.";
const ANSWER = 'SUPPORT_ANSWER\nTime each area, then tap the Record button for that area.';
const quoteLine = (id: string, quote: string) => `SUPPORT_QUOTE [${id}]: "${quote}"`;
const verify = (...lines: string[]) => verifySupportAnswerQuotes(lines.join('\n'), ASKQ_GUIDES);

const ID = 'judge-steward-quickstart';
const TITLE = 'Ringside Quickstart';
const STEP_QUOTE = 'Tap Ringside in the sidebar. If one show is running today, it opens.';
const SECRETARY_QUOTE =
  'Show details: Actions → Edit show (the Actions button sits in the top bar, left of the bell)';

describe('verifySupportAnswerQuotes', () => {
  it('shows only the verified passage, grouped under the guide title', () => {
    const result = verify(ANSWER, quoteLine(ID, GOOD_QUOTE));
    expect(result).toEqual({
      ok: true,
      answerText: `From the ${TITLE}:\n“${GOOD_QUOTE}”`,
      guideSources: [
        {
          id: ID,
          title: TITLE,
          audience: expect.any(String),
          quote: GOOD_QUOTE,
          content: GOOD_QUOTE,
        },
      ],
    });
  });

  it('makes two groups for two guides, and one group for consecutive quotes of one guide', () => {
    const result = verify(
      ANSWER,
      quoteLine(ID, STEP_QUOTE),
      quoteLine(ID, GOOD_QUOTE),
      quoteLine('secretary-guide', SECRETARY_QUOTE)
    );
    expect(result.ok && result.answerText).toBe(
      `From the ${TITLE}:\n“${STEP_QUOTE}”\n“${GOOD_QUOTE}”\n\nFrom the Secretary Guide:\n“${SECRETARY_QUOTE}”`
    );
  });

  it('never shows model prose before or between quotes', () => {
    const result = verify(
      'SUPPORT_ANSWER: Here is my own advice.',
      'More of my own words.',
      quoteLine(ID, STEP_QUOTE),
      'Then do something invented.',
      quoteLine(ID, GOOD_QUOTE)
    );
    expect(result.ok && result.answerText).toBe(
      `From the ${TITLE}:\n“${STEP_QUOTE}”\n“${GOOD_QUOTE}”`
    );
  });

  it('escalates as handoff when the prose contains SUPPORT_HANDOFF', () => {
    expect(verify(ANSWER, 'SUPPORT_HANDOFF', quoteLine(ID, GOOD_QUOTE))).toEqual({
      ok: false,
      reason: 'handoff',
    });
    expect(verify('SUPPORT_ANSWER SUPPORT_HANDOFF', quoteLine(ID, GOOD_QUOTE))).toEqual({
      ok: false,
      reason: 'handoff',
    });
  });

  it('rejects a fourth quote', () => {
    const q = quoteLine(ID, GOOD_QUOTE);
    expect(verify(ANSWER, q, q, q).ok).toBe(true);
    expect(verify(ANSWER, q, q, q, q)).toEqual({
      ok: false,
      reason: 'quote_rejected',
      detail: 'too_many_quotes',
    });
  });

  it('rejects a quote over 120 tokens and accepts one of exactly 120', () => {
    const guide = ASKQ_GUIDES.find(g => g.id === ID)!;
    const words = tokenizeQuoteText(guide.content);
    const run = (n: number) => words.slice(0, n).join(' ');
    expect(verify(ANSWER, quoteLine(ID, run(121))).ok).toBe(false);
    expect(verify(ANSWER, quoteLine(ID, run(120))).ok).toBe(true);
  });

  it('strips markdown from the displayed passage', () => {
    const result = verify(
      ANSWER,
      quoteLine(ID, '1. Tap **Ringside** in the sidebar. If one show is `running` today, it opens.')
    );
    expect(result.ok && result.answerText).toBe(
      `From the ${TITLE}:\n“Tap Ringside in the sidebar. If one show is running today, it opens.”`
    );
  });

  it('accepts a terse answer and shows the quote only (Codex case a)', () => {
    const result = verify(
      'SUPPORT_ANSWER\nTap Ringside in the sidebar.',
      quoteLine(ID, STEP_QUOTE)
    );
    expect(result.ok && result.answerText).toBe(`From the ${TITLE}:\n“${STEP_QUOTE}”`);
  });

  it('never shows an invented time-zone instruction (Codex case b)', () => {
    const result = verify(
      'SUPPORT_ANSWER\nChange the time zone in Basic Info.',
      quoteLine('secretary-guide', SECRETARY_QUOTE)
    );
    expect(result.ok && result.answerText).toBe(`From the Secretary Guide:\n“${SECRETARY_QUOTE}”`);
    expect(result.ok && result.answerText).not.toMatch(/time zone|Basic Info/i);
  });

  it('verifies a quote that keeps the markdown bold from the source', () => {
    const result = verify(
      ANSWER,
      quoteLine(
        'judge-steward-quickstart',
        "Before you tap **Save**, check that every area's field has a time."
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
    expect(verify(ANSWER, quoteLine('judge-steward-quickstart', 'Before you tap Save')).ok).toBe(
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
  const TAP_QUOTE =
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
    expect(result).toMatchObject({ ok: true, answerText: `From the ${TITLE}:\n“${GOOD_QUOTE}”` });
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
    expect(verify(STEP_ANSWER, quoteLine(ID, TAP_QUOTE)).ok).toBe(true);
  });

  it('accepts curly quotes, dashes and a .md id', () => {
    const result = verify(
      ANSWER,
      quoteLine(`${ID}.md`, "Before you tap **Save**, check that every area's field has a time")
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
      verify(ANSWER, quoteLine(ID, "efore you tap Save, check that every area's field has a time"))
        .ok
    ).toBe(false);
    expect(
      verify(ANSWER, quoteLine(ID, "Before you tap Save, check that every area's field has a ti"))
        .ok
    ).toBe(false);
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
    expect(verify(ANSWER)).toEqual({ ok: false, reason: 'quote_rejected', detail: 'no_quotes' });
  });

  it('never leaves a marker string in an accepted answer', () => {
    const result = verify(
      '**SUPPORT_ANSWER**',
      'Time each area, SUPPORT_ANSWER then tap the Record button SUPPORT_QUOTE for that area.',
      quoteLine(ID, GOOD_QUOTE)
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.answerText).not.toMatch(/SUPPORT_/);
    if (result.ok) expect(result.answerText).not.toMatch(/Time each area/);
  });
});

describe('whole short steps and screenshots (MYK9-2472)', () => {
  const EXHIBITOR = 'exhibitor-guide';
  // Step 1 of "Add Your Dog": seven words, under the eight-word floor.
  const STEP_ONE = 'Go to My Dogs in the navigation.';
  const STEP_TWO =
    'Open Actions → Add Dog. (Before you have any dogs, the page shows an Add Dog button instead.) The panel opens on the Registration tab.';

  it('accepts a whole step shorter than eight words on its own line', () => {
    expect(tokenizeQuoteText(STEP_ONE)).toHaveLength(7);
    const result = verify(ANSWER, quoteLine(EXHIBITOR, STEP_ONE), quoteLine(EXHIBITOR, STEP_TWO));
    expect(result.ok && result.answerText).toBe(
      `From the Exhibitor Guide:\n“${STEP_ONE}”\n“${STEP_TWO}”`
    );
  });

  it('accepts a whole short sentence from inside a longer line', () => {
    expect(verify(ANSWER, quoteLine(EXHIBITOR, 'Any refund returns the entry fee only.')).ok).toBe(
      true
    );
  });

  it('still rejects a short fragment that is not a whole step or sentence', () => {
    expect(verify(ANSWER, quoteLine(EXHIBITOR, 'Go to My Dogs in the'))).toEqual({
      ok: false,
      reason: 'quote_rejected',
      detail: 'quote_too_short',
    });
    // A whole sentence, but under the four-word floor for whole passages.
    expect(verify(ANSWER, quoteLine(EXHIBITOR, 'Contact the show')).ok).toBe(false);
  });

  it('accepts a passage that runs on past a screenshot', () => {
    // The E-05 screenshot sits between step 4 and step 5 in the guide.
    const acrossTheScreenshot =
      'Otherwise, fill in the Registered Name and Registered Breed (the other registration fields are optional), then click Save and continue. On the Essential tab, fill in:';
    expect(verify(ANSWER, quoteLine(EXHIBITOR, acrossTheScreenshot)).ok).toBe(true);
  });

  it('never matches the words of a screenshot caption', () => {
    expect(
      verify(ANSWER, quoteLine(EXHIBITOR, 'Add Dog panel — Registration tab with Find dog'))
    ).toEqual({
      ok: false,
      reason: 'quote_rejected',
      detail: 'quote_not_in_guide',
      failedQuote: 'Add Dog panel — Registration tab with Find dog',
    });
  });

  // Codex review of #4464: the caption was dropped for checking but kept for display, so words
  // nobody verified reached the answer and its citation.
  it('keeps a copied screenshot out of the answer and its citation', () => {
    const withTheScreenshot =
      'Otherwise, fill in the Registered Name and Registered Breed (the other registration fields are optional), then click Save and continue. ![E-05: Add Dog panel — Registration tab with Find dog](../screenshots/E-05.png) On the Essential tab, fill in:';
    const result = verify(ANSWER, quoteLine(EXHIBITOR, withTheScreenshot));

    expect(result.ok).toBe(true);
    const shown = result.ok ? [result.answerText, ...result.guideSources.map(s => s.quote)] : [];
    for (const text of shown) {
      expect(text).not.toMatch(/E-05|Find dog|screenshots|!/);
      expect(text).toContain('then click Save and continue. On the Essential tab, fill in:');
    }
  });

  // Codex review of #4464: in the Secretary Guide this sentence follows a bold question that
  // ends `?**`, so a split on "punctuation then space" never saw the boundary.
  it('accepts a whole short sentence that follows bold or quoted text', () => {
    const afterBold = 'Do not ask for it again.';
    expect(tokenizeQuoteText(afterBold)).toHaveLength(6);
    expect(verify(ANSWER, quoteLine('secretary-guide', afterBold)).ok).toBe(true);

    const guide = { id: 'g', title: 'G', audience: 'all', content: '' };
    const inGuide = (content: string, quote: string) =>
      verifySupportAnswerQuotes(`${ANSWER}\n${quoteLine('g', quote)}`, [{ ...guide, content }]).ok;
    expect(
      inGuide('She said "Is it ready?" Send the premium now. Then wait.', 'Send the premium now.')
    ).toBe(true);
    expect(
      inGuide('(See the Fees tab.) Enter the fee here. Then save.', 'Enter the fee here.')
    ).toBe(true);
    // Still a fragment: not a whole sentence.
    expect(inGuide('**Ready?** Do not ask for it again today.', 'Do not ask for it')).toBe(false);
  });

  it('names the rule that rejected the quotes', () => {
    const detail = (...lines: string[]) => {
      const result = verify(ANSWER, ...lines);
      return result.ok ? null : result.detail;
    };
    expect(detail('SUPPORT_QUOTE exhibitor-guide: no brackets or quote marks')).toBe(
      'malformed_quote'
    );
    expect(detail(quoteLine('no-such-guide', GOOD_QUOTE))).toBe('unknown_guide');
    expect(
      detail(quoteLine(ID, 'These words are nowhere in the ringside quickstart at all.'))
    ).toBe('quote_not_in_guide');
    const words = tokenizeQuoteText(ASKQ_GUIDES.find(g => g.id === ID)!.content);
    expect(detail(quoteLine(ID, words.slice(0, 121).join(' ')))).toBe('quote_too_long');
  });
});
