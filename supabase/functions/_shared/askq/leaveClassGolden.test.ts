// @vitest-environment node
// MYK9-1775 golden question: no live model call. Asserts on the prompt and guide
// context the model would see, and on the quote verifier for a stubbed answer.
import { describe, expect, it } from 'vitest';
import { ASKQ_GUIDES } from './documentAssets.ts';
import { callerIsShowManager, getDocumentGuides } from './guideScope.ts';
import { buildAskQSystemPrompt } from './systemPrompt.ts';
import { parseSupportAnswer } from './supportMode.ts';
import { getSupportEscalationForQuestion } from './supportMode.ts';
import type { AskQQuestionMode, UserContext } from './types.ts';

const LEAVE_CLASS_QUESTION =
  "I can't make it to the show anymore. How do I drop my dog from the class, and do I get my money back?";
const LATE_ENTRY_QUESTION = 'Someone walks up on show day wanting to enter. How do I add them?';

const userContext: UserContext = {
  userId: 'user-1',
  displayName: 'Pat',
  dogs: [],
  showId: null,
  showName: null,
  showRegistries: [],
};

const assemble = (questionMode: AskQQuestionMode | null, isShowManager: boolean) =>
  buildAskQSystemPrompt({
    userContext,
    questionMode,
    effectiveSupportMode: questionMode === 'app-help',
    isShowManager,
    allGuides: ASKQ_GUIDES,
    rulebooks: [],
  });

const ENTRY_FEE_ONLY = 'Any refund returns the entry fee only.';
const SERVICE_FEE =
  'The service fee you paid at checkout is not refunded, including when the show is cancelled.';

describe('MYK9-1775 leave class / refund (exhibitor, App help)', () => {
  const { systemPrompt, guides } = assemble('app-help', false);

  it('does not escalate the question before the model sees it', () => {
    expect(getSupportEscalationForQuestion(LEAVE_CLASS_QUESTION)).toBeNull();
  });

  it('includes exhibitor guide section 9 with the path, Pull vs Withdraw and the service-fee rule', () => {
    expect(guides.map(guide => guide.id)).toContain('exhibitor-guide');
    expect(systemPrompt).toContain('## Section 9 — Leave a Class: Withdraw or Pull');
    expect(systemPrompt).toContain('Leave class…');
    expect(systemPrompt).toContain("Refunds for a pull are at the club's discretion.");
    expect(systemPrompt).toContain(ENTRY_FEE_ONLY);
    expect(systemPrompt).toContain(SERVICE_FEE);
  });

  it('leaves out the secretary guide and its Remove entry row for an exhibitor', () => {
    expect(guides.map(guide => guide.id)).not.toContain('secretary-guide');
    expect(guides.map(guide => guide.id)).not.toContain('club-admin-guide');
    expect(systemPrompt).not.toContain('<guide id="secretary-guide"');
    expect(systemPrompt).not.toContain('Remove entry');
    // "30 minutes" is the exhibitor guide's payment hold, so pin the invented deadline instead.
    expect(systemPrompt).not.toContain('Deadline to withdraw');
  });

  it('carries the grounding rules', () => {
    expect(systemPrompt).toContain('GROUNDING RULES (app help)');
    expect(systemPrompt).toContain('Never offer an action from another role');
    expect(systemPrompt).toContain('Never state a deadline');
    expect(systemPrompt).toContain('do not ask which registry');
    expect(systemPrompt).toContain('adjusts, reassigns');
  });

  it('accepts a stubbed answer built from section 9 quotes and shows only the quotes', () => {
    const stub = [
      'SUPPORT_ANSWER',
      `SUPPORT_QUOTE [exhibitor-guide]: "${ENTRY_FEE_ONLY} ${SERVICE_FEE}"`,
    ].join('\n');
    const parsed = parseSupportAnswer(stub, guides);
    expect(parsed.escalation).toBeNull();
    expect(parsed.guideSources.map(source => source.id)).toEqual(['exhibitor-guide']);
    expect(parsed.answerText).not.toContain('Remove entry');
    expect(parsed.answerText).not.toContain('30 minutes');
  });

  it('rejects a stubbed answer quoting the secretary guide for an exhibitor', () => {
    const stub = [
      'SUPPORT_ANSWER',
      'SUPPORT_QUOTE [secretary-guide]: "Remove entry The entry was made by mistake. It removes that entry."',
    ].join('\n');
    const parsed = parseSupportAnswer(stub, guides);
    expect(parsed.escalation).not.toBeNull();
    expect(parsed.guideSources).toEqual([]);
  });
});

describe('MYK9-1775 secretary late entry (App help, manager)', () => {
  const { systemPrompt } = assemble('app-help', true);

  it('keeps the secretary guide late-entry path for a show manager', () => {
    expect(getSupportEscalationForQuestion(LATE_ENTRY_QUESTION)).toBeNull();
    expect(systemPrompt).toContain('Entry Forms → Actions → Add late entry.');
    expect(systemPrompt).toContain('The row is greyed, with the reason, when no class has room.');
    expect(systemPrompt).not.toContain('adjust the judge');
  });
});

describe('MYK9-1775 This show mode', () => {
  const { systemPrompt, guides } = assemble('show-data', false);

  it('has no guides and routes how-to questions to App help', () => {
    expect(guides).toEqual([]);
    expect(systemPrompt).toContain('GROUNDING RULES (this show)');
    expect(systemPrompt).toContain('switch to App help');
    expect(systemPrompt).toContain('which entries are withdrawn or pulled');
    expect(systemPrompt).not.toContain('Leave a Class');
  });
});

describe('default This show request (no questionMode)', () => {
  const { systemPrompt, guides } = assemble(null, false);

  it('keeps the guides role-scoped and carries the app-help grounding rules', () => {
    expect(guides.map(guide => guide.id)).not.toContain('secretary-guide');
    expect(systemPrompt).toContain('GROUNDING RULES (app help)');
    expect(systemPrompt).not.toContain('Remove entry');
  });
});

describe('role scoping', () => {
  it('returns every guide to a show manager and none of the management guides otherwise', () => {
    expect(getDocumentGuides(ASKQ_GUIDES, 'app-help', true)).toEqual(ASKQ_GUIDES);
    expect(getDocumentGuides(ASKQ_GUIDES, 'app-help', false).map(guide => guide.id)).toEqual([
      'exhibitor-guide',
      'judge-steward-quickstart',
    ]);
  });

  it('fails closed when the role check errors or answers anything but true', async () => {
    const reply = (data: unknown, error: { message: string } | null) => ({
      rpc: async () => ({ data, error }),
    });
    expect(await callerIsShowManager(reply(true, null))).toBe(true);
    expect(await callerIsShowManager(reply(true, { message: 'boom' }))).toBe(false);
    expect(await callerIsShowManager(reply(null, null))).toBe(false);
    expect(await callerIsShowManager(reply('true', null))).toBe(false);
  });
});
