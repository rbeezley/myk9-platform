// @vitest-environment node
// MYK9-2472 / MYK9-2473 golden questions: no live model call. Asserts on the guide context the
// model would see and on the quote verifier for the answers a model naturally writes. On
// 2026-11-26 production refused both questions with `support_quote_rejected`.
import { describe, expect, it } from 'vitest';
import { ASKQ_GUIDES } from './documentAssets.ts';
import { buildGuidesPrompt } from './sourcePrompts.ts';
import { getSupportEscalationForQuestion, parseSupportAnswer } from './supportMode.ts';
import type { UserContext } from './types.ts';

const ADD_DOG_QUESTION = 'How do I add my dog?';

const userContext: UserContext = {
  userId: 'user-1',
  displayName: 'Pat',
  dogs: [],
  showId: null,
  showName: null,
  showRegistries: [],
};

const { systemPrompt, guides } = buildGuidesPrompt({
  userContext,
  hasStaffRole: false,
  allGuides: ASKQ_GUIDES,
});

const answer = (...passages: string[]) =>
  [
    'SUPPORT_ANSWER',
    ...passages.map(passage => `SUPPORT_QUOTE [exhibitor-guide]: "${passage}"`),
  ].join('\n');

const STEP_1 = 'Go to **My Dogs** in the navigation.';
const STEP_2 =
  'Open **Actions** → **Add Dog**. (Before you have any dogs, the page shows an **Add Dog** button instead.) The panel opens on the **Registration** tab.';
const STEP_3_START =
  'Choose the **Registration Organization**, type the **Registration Number**, and click **Find dog**.';

describe('MYK9-2472 "How do I add my dog?" (exhibitor, guides source)', () => {
  it('does not escalate the question before the model sees it', () => {
    expect(getSupportEscalationForQuestion(ADD_DOG_QUESTION)).toBeNull();
  });

  it('gives the model section 3 with the Add Dog steps', () => {
    expect(systemPrompt).toContain('## Section 3 — Add Your Dog');
    expect(systemPrompt).toContain(STEP_1);
    expect(systemPrompt).toContain(STEP_2);
  });

  it('accepts the steps quoted one per line, starting with the seven-word step 1', () => {
    // The natural answer. Step 1 alone used to reject all three lines.
    const parsed = parseSupportAnswer(answer(STEP_1, STEP_2, STEP_3_START), guides);

    expect(parsed.escalation).toBeNull();
    expect(parsed.answerText).toBe(
      [
        'From the Exhibitor Guide:',
        '“Go to My Dogs in the navigation.”',
        '“Open Actions → Add Dog. (Before you have any dogs, the page shows an Add Dog button instead.) The panel opens on the Registration tab.”',
        '“Choose the Registration Organization, type the Registration Number, and click Find dog.”',
      ].join('\n')
    );
  });

  it('accepts steps that run on past the screenshot between step 4 and step 5', () => {
    const parsed = parseSupportAnswer(
      answer(
        `${STEP_1} ${STEP_2}`,
        'Otherwise, fill in the **Registered Name** and **Registered Breed** (the other registration fields are optional), then click **Save and continue**. On the **Essential** tab, fill in:'
      ),
      guides
    );

    expect(parsed.escalation).toBeNull();
    expect(parsed.guideSources).toHaveLength(2);
  });

  it('records which rule refused a step-per-line answer of all six steps', () => {
    // Still refused: more than three quote lines. The log now says so.
    const parsed = parseSupportAnswer(answer(STEP_1, STEP_2, STEP_3_START, STEP_1), guides);

    expect(parsed.escalationCause).toBe('quote_rejected');
    expect(parsed.escalationDetail).toBe('too_many_quotes');
  });
});

// The question asked: "I can't make it, can I drop my dog and get my money back?"
describe('MYK9-2473 drop my dog and get my money back (exhibitor, guides source)', () => {
  it('tells the model to quote the leave-a-class policy from the guide', () => {
    expect(systemPrompt).toContain('## Section 9 — Leave a Class: Withdraw or Pull');
    expect(systemPrompt).toContain('leaving a class (Pull or Withdraw)');
  });

  it('accepts the path, the pull-refund rule and the seven-word fee sentence', () => {
    // "Any refund returns the entry fee only." is seven words and used to reject the answer.
    const parsed = parseSupportAnswer(
      answer(
        "On **My Shows**, find the class on your dog's card and tap **Pull or withdraw…**.",
        "Refunds for a pull are at the club's discretion.",
        'Any refund returns the entry fee only.'
      ),
      guides
    );

    expect(parsed.escalation).toBeNull();
    expect(parsed.answerText).toContain('tap Pull or withdraw…');
    expect(parsed.answerText).toContain('Any refund returns the entry fee only.');
    expect(parsed.answerText).not.toContain('Remove entry');
  });
});
