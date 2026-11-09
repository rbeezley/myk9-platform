// @vitest-environment node
// MYK9-1775 golden question: no live model call. Asserts on the prompt and guide
// context the model would see, and on the quote verifier for a stubbed answer.
import { describe, expect, it } from 'vitest';
import { ASKQ_GUIDES } from './documentAssets.ts';
import { callerHoldsStaffRole, getDocumentGuides } from './guideScope.ts';
import { buildAskQSystemPrompt } from './systemPrompt.ts';
import { parseSupportAnswer } from './supportMode.ts';
import { getSupportEscalationForQuestion } from './supportMode.ts';
import { getActiveTools, getDocumentRulebooks, parseShowDataAnswer } from './showModeRouting.ts';
import { TOOLS } from './toolDefinitions.ts';
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
const SWITCH_MODES = /switch modes|switch to App help|switch to Rules/i;

// Mirrors the entrypoint for This show: the guides and the show's rulebook ride along with the tools.
const assembleThisShow = (hasStaffRole: boolean) => {
  const built = buildAskQSystemPrompt({
    userContext: {
      ...userContext,
      showId: 'show-1',
      showName: 'Heartland',
      showRegistries: ['AKC Scent Work'],
    },
    questionMode: 'show-data',
    effectiveSupportMode: false,
    hasStaffRole,
    allGuides: ASKQ_GUIDES,
    rulebooks: getDocumentRulebooks('show-data', [AKC_RULEBOOK]),
  });
  return { ...built, tools: getActiveTools('show-data', false) };
};

describe('MYK9-1775 This show mode answers app-help and rules questions from the documents', () => {
  const plan = assembleThisShow(false);

  it('does not escalate the owner question before the model sees it', () => {
    expect(getSupportEscalationForQuestion(SHOW_MODE_QUESTION)).toBeNull();
  });

  it('loads exhibitor guide section 9 and never tells the user to switch modes', () => {
    expect(plan.guides.map(guide => guide.id)).toContain('exhibitor-guide');
    expect(plan.systemPrompt).toContain('## Section 9 — Leave a Class: Withdraw or Pull');
    expect(plan.systemPrompt).toContain(ENTRY_FEE_ONLY);
    expect(plan.systemPrompt).toContain('GROUNDING RULES (this show)');
    expect(plan.systemPrompt).toContain('SUPPORT_QUOTE [<guide id>]');
    expect(plan.systemPrompt).not.toMatch(SWITCH_MODES);
  });

  it('keeps the role guide scope: an exhibitor gets no secretary guide, staff do', () => {
    expect(plan.systemPrompt).not.toContain('<guide id="secretary-guide"');
    expect(plan.guides.map(guide => guide.id)).toEqual(PUBLIC_GUIDE_IDS);
    expect(assembleThisShow(true).guides.map(guide => guide.id)).toEqual(ALL_GUIDE_IDS);
  });

  it('verifies a guide answer by its quotes and passes a tool answer through', () => {
    const stub = [
      'SUPPORT_ANSWER',
      `SUPPORT_QUOTE [exhibitor-guide]: "${ENTRY_FEE_ONLY} ${SERVICE_FEE}"`,
    ].join('\n');
    expect(parseShowDataAnswer(stub, plan.guides).guideSources.map(s => s.id)).toEqual([
      'exhibitor-guide',
    ]);
    const forged =
      'SUPPORT_ANSWER\nSUPPORT_QUOTE [exhibitor-guide]: "A refund is always automatic within ten days."';
    expect(parseShowDataAnswer(forged, plan.guides).escalation).not.toBeNull();
    const toolAnswer = 'Novice Interior is running now in Ring 2.';
    expect(parseShowDataAnswer(toolAnswer, plan.guides)).toEqual({
      answerText: toolAnswer,
      escalation: null,
      escalationCause: null,
      guideSources: [],
    });
  });

  it('carries only the show registry rulebook, with a source label rule', () => {
    expect(plan.systemPrompt).toContain('<selected_rulebook id="akc-scent-work"');
    expect(plan.systemPrompt).not.toContain('ukc-nosework');
    expect(plan.systemPrompt).not.toContain('asca-scent-detection');
    expect(plan.systemPrompt).toContain('Using AKC Scent Work rules:');
  });

  // Codex review of PR 3731: a keyword router took the tools away from these.
  it.each([
    'Is Novice Interior running yet?',
    'Is my dog entered in Novice Interior?',
    'Has my entry been cancelled?',
    SHOW_MODE_QUESTION,
  ])('keeps the live-data tools for: %s', () => {
    expect(plan.tools.map(tool => tool.name)).toEqual(TOOLS.map(tool => tool.name));
    expect(plan.tools.length).toBeGreaterThan(0);
    expect(plan.systemPrompt).toContain('Use live show-data tools');
  });

  it('still turns the tools off for App help and Rules', () => {
    expect(getActiveTools('app-help', true)).toEqual([]);
    expect(getActiveTools('rules', false)).toEqual([]);
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
