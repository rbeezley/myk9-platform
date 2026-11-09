// @vitest-environment node
// MYK9-1775 golden question: no live model call. Asserts on the prompt and guide
// context the model would see, and on the quote verifier for a stubbed answer.
import { describe, expect, it } from 'vitest';
import { ASKQ_GUIDES } from './documentAssets.ts';
import { callerHoldsStaffRole, getDocumentGuides } from './guideScope.ts';
import { buildAskQSystemPrompt } from './systemPrompt.ts';
import { parseSupportAnswer } from './supportMode.ts';
import { getSupportEscalationForQuestion } from './supportMode.ts';
import { planAnswerMode } from './showModeRouting.ts';
import { ASKQ_RULEBOOKS } from './documentAssets.ts';
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

const assemble = (questionMode: AskQQuestionMode, hasStaffRole: boolean) =>
  buildAskQSystemPrompt({
    userContext,
    questionMode,
    effectiveSupportMode: questionMode === 'app-help',
    hasStaffRole,
    allGuides: ASKQ_GUIDES,
    rulebooks: [],
  });

const AKC_RULEBOOK = ASKQ_RULEBOOKS.find(rulebook => rulebook.id === 'akc-scent-work')!;
const SWITCH_MODES = /switch modes|switch to App help/i;
const PUBLIC_GUIDE_IDS = ['exhibitor-guide', 'judge-steward-quickstart'];
const ALL_GUIDE_IDS = ASKQ_GUIDES.map(guide => guide.id);
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

// The owner's live re-ask (2026-11-09, ask-myk9show v85): This show mode refused it.
const SHOW_MODE_QUESTION =
  'I need to take my dog out of a class I entered. How do I do that, and do I get my money back?';

// Mirrors the entrypoint: plan the mode, then build the prompt for the planned mode.
const assembleThisShow = (message: string, hasStaffRole: boolean) => {
  const { answerMode, answerSupportMode } = planAnswerMode('show-data', false, message);
  const rulebooks = answerMode === 'rules' ? [AKC_RULEBOOK] : [];
  return {
    answerMode,
    answerSupportMode,
    ...buildAskQSystemPrompt({
      userContext: {
        ...userContext,
        showId: 'show-1',
        showName: 'Heartland',
        showRegistries: ['AKC Scent Work'],
      },
      questionMode: answerMode,
      effectiveSupportMode: answerSupportMode,
      hasStaffRole,
      allGuides: ASKQ_GUIDES,
      rulebooks,
    }),
  };
};

describe('MYK9-1775 This show mode answers app-help questions from the guides', () => {
  const plan = assembleThisShow(SHOW_MODE_QUESTION, false);

  it('does not escalate the question before the model sees it', () => {
    expect(getSupportEscalationForQuestion(SHOW_MODE_QUESTION)).toBeNull();
  });

  it('loads the exhibitor guide section 9 and never tells the user to switch modes', () => {
    expect(plan.answerMode).toBe('app-help');
    expect(plan.answerSupportMode).toBe(true);
    expect(plan.guides.map(guide => guide.id)).toContain('exhibitor-guide');
    expect(plan.systemPrompt).toContain('## Section 9 — Leave a Class: Withdraw or Pull');
    expect(plan.systemPrompt).toContain(ENTRY_FEE_ONLY);
    expect(plan.systemPrompt).toContain('GROUNDING RULES (app help)');
    expect(plan.systemPrompt).not.toMatch(SWITCH_MODES);
  });

  it('keeps the role guide scope: an exhibitor gets no secretary guide, staff do', () => {
    expect(plan.systemPrompt).not.toContain('<guide id="secretary-guide"');
    expect(plan.guides.map(guide => guide.id)).toEqual(PUBLIC_GUIDE_IDS);
    expect(assembleThisShow(SHOW_MODE_QUESTION, true).guides.map(guide => guide.id)).toEqual(
      ALL_GUIDE_IDS
    );
  });

  it('verifies a stubbed answer against the guide quotes like App help', () => {
    const stub = [
      'SUPPORT_ANSWER',
      `SUPPORT_QUOTE [exhibitor-guide]: "${ENTRY_FEE_ONLY} ${SERVICE_FEE}"`,
    ].join('\n');
    expect(parseSupportAnswer(stub, plan.guides).guideSources.map(source => source.id)).toEqual([
      'exhibitor-guide',
    ]);
  });
});

describe('MYK9-1775 This show mode answers rules questions from the show registry rulebook', () => {
  const plan = assembleThisShow(
    'What is the maximum time for an AKC Novice interior search?',
    false
  );

  it('uses the rules path with only the show registry rulebook and no guides', () => {
    expect(plan.answerMode).toBe('rules');
    expect(plan.answerSupportMode).toBe(false);
    expect(plan.guides).toEqual([]);
    expect(plan.systemPrompt).toContain('<selected_rulebook id="akc-scent-work"');
    expect(plan.systemPrompt).not.toContain('ukc-nosework');
    expect(plan.systemPrompt).not.toContain('asca-scent-detection');
    expect(plan.systemPrompt).not.toMatch(SWITCH_MODES);
  });
});

describe('MYK9-1775 This show mode keeps live-data questions on the show-data tools', () => {
  it.each([
    'How did my dog do today?',
    'Who won Novice Interior?',
    'Which entries are withdrawn or pulled?',
    'What time does the first class start?',
  ])('%s', question => {
    const plan = assembleThisShow(question, false);
    expect(plan.answerMode).toBe('show-data');
    expect(plan.answerSupportMode).toBe(false);
    expect(plan.guides).toEqual([]);
    expect(plan.systemPrompt).toContain('Use live show-data tools');
    expect(plan.systemPrompt).not.toMatch(SWITCH_MODES);
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
});

// Real role-shaped rows, as `select('is_active, expires_at, role:roles(name)')` returns them.
const roleRow = (name: string, over: Record<string, unknown> = {}) => ({
  is_active: true,
  expires_at: null,
  role: { name },
  ...over,
});
const clientReturning = (data: unknown, error: { message: string } | null = null) => {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'or']) query[method] = () => query;
  query.then = (resolve: (value: unknown) => unknown) => resolve({ data, error });
  return { from: () => query } as never;
};
const guideIdsFor = async (rows: unknown, error: { message: string } | null = null) =>
  getDocumentGuides(
    ASKQ_GUIDES,
    'app-help',
    await callerHoldsStaffRole(clientReturning(rows, error), 'user-1')
  ).map(guide => guide.id);
const ALL_IDS = ASKQ_GUIDES.map(guide => guide.id);
const PUBLIC_IDS = ['exhibitor-guide', 'judge-steward-quickstart'];

describe('guide scope from the caller roles (any staff role anywhere)', () => {
  it('gives a show-scoped secretary every guide', async () => {
    expect(await guideIdsFor([roleRow('secretary', { show_id: 'show-1' })])).toEqual(ALL_IDS);
  });
  it('gives a club-scoped secretary every guide', async () => {
    expect(await guideIdsFor([roleRow('secretary', { club_id: 'club-1' })])).toEqual(ALL_IDS);
  });
  it('gives a judge every guide', async () => {
    expect(await guideIdsFor([roleRow('judge')])).toEqual(ALL_IDS);
  });
  it('gives exhibitor and judge guides only to an expired secretary', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(await guideIdsFor([roleRow('secretary', { expires_at: past })])).toEqual(PUBLIC_IDS);
    expect(await guideIdsFor([roleRow('secretary', { is_active: false })])).toEqual(PUBLIC_IDS);
  });
  it('gives exhibitor and judge guides only to an exhibitor-only user', async () => {
    expect(await guideIdsFor([roleRow('exhibitor')])).toEqual(PUBLIC_IDS);
    expect(await guideIdsFor([])).toEqual(PUBLIC_IDS);
  });
  it('fails closed when the roles read errors', async () => {
    expect(await guideIdsFor(null, { message: 'boom' })).toEqual(PUBLIC_IDS);
  });
});
