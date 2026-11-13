// @vitest-environment node
// MYK9-1775 golden question: no live model call. Asserts on the prompt and guide
// context the model would see, and on the quote verifier for a stubbed answer.
import { describe, expect, it } from 'vitest';
import { ASKQ_GUIDES } from './documentAssets.ts';
import { callerHoldsStaffRole, scopeGuidesToRole } from './guideScope.ts';
import { buildGuidesPrompt, buildShowDataPrompt } from './sourcePrompts.ts';
import { getSupportEscalationForQuestion, parseSupportAnswer } from './supportMode.ts';
import type { UserContext } from './types.ts';

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

const assemble = (hasStaffRole: boolean) =>
  buildGuidesPrompt({ userContext, hasStaffRole, allGuides: ASKQ_GUIDES });

const ENTRY_FEE_ONLY = 'Any refund returns the entry fee only.';
const SERVICE_FEE =
  'The service fee you paid at checkout is not refunded, including when the show is cancelled.';

describe('MYK9-1775 leave class / refund (exhibitor, guides source)', () => {
  const { systemPrompt, guides } = assemble(false);

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

describe('MYK9-1775 secretary late entry (guides source, manager)', () => {
  const { systemPrompt } = assemble(true);

  it('keeps the secretary guide late-entry path for a show manager', () => {
    expect(getSupportEscalationForQuestion(LATE_ENTRY_QUESTION)).toBeNull();
    expect(systemPrompt).toContain('Entry Forms → Actions → Add late entry.');
    expect(systemPrompt).toContain('The row is greyed, with the reason, when no class has room.');
    expect(systemPrompt).not.toContain('adjust the judge');
  });
});

describe('MYK9-1825 show-data source', () => {
  const systemPrompt = buildShowDataPrompt({ userContext });

  it('carries no guide text and never tells the user to switch modes or tabs', () => {
    expect(systemPrompt).toContain('GROUNDING RULES (this show)');
    expect(systemPrompt).toContain('which entries are withdrawn or pulled');
    expect(systemPrompt).not.toContain('Leave a Class');
    expect(systemPrompt).not.toContain('<verified_user_guides>');
    expect(systemPrompt).not.toMatch(/switch to|switch modes/i);
  });
});

describe('role scoping', () => {
  it('returns every guide to a show manager and none of the management guides otherwise', () => {
    expect(scopeGuidesToRole(ASKQ_GUIDES, true)).toEqual(ASKQ_GUIDES);
    expect(scopeGuidesToRole(ASKQ_GUIDES, false).map(guide => guide.id)).toEqual([
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
  scopeGuidesToRole(
    ASKQ_GUIDES,
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
