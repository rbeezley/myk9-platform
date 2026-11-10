import { describe, expect, it } from 'vitest';
import { parseAskQRouting, resolveRulebookContext } from './requestRouting.ts';
import type { AskQRulebookAsset } from './documentContext.ts';

const rulebooks: AskQRulebookAsset[] = [
  {
    id: 'akc-scent-work',
    organizationCode: 'AKC',
    sportCode: 'akc-scent-work',
    title: 'AKC Scent Work Regulations',
    content: 'AKC rules',
  },
  {
    id: 'ukc-nosework',
    organizationCode: 'UKC',
    sportCode: 'ukc-nosework',
    title: 'UKC Nose Work Rules',
    content: 'UKC rules',
  },
];

describe('AskQ request routing', () => {
  it('keeps omitted questionMode backward compatible', () => {
    expect(parseAskQRouting(undefined, undefined)).toEqual({ ok: true });
  });

  it('accepts every tab the deployed client sends without restricting sources', () => {
    for (const mode of ['app-help', 'rules', 'show-data']) {
      expect(parseAskQRouting(mode, undefined)).toEqual({ ok: true });
    }
  });

  it('validates selected question mode and rulebook scope', () => {
    expect(parseAskQRouting('rules', { organizationCode: 'akc', sportCode: 'Scent Work' })).toEqual(
      {
        ok: true,
        rulebookScope: { organizationCode: 'AKC', sportCode: 'Scent Work' },
      }
    );

    expect(parseAskQRouting('other', undefined)).toEqual({
      ok: false,
      error: 'Invalid questionMode',
    });
    expect(parseAskQRouting('rules', { organizationCode: 12 })).toEqual({
      ok: false,
      error: 'Invalid rulebookScope',
    });
  });

  it('asks for clarification when more than one rulebook could apply', () => {
    const resolution = resolveRulebookContext({
      allRulebooks: rulebooks,
      showRulebooks: [],
      hasVerifiedShowContext: false,
    });

    expect(resolution.rulebooks).toEqual([]);
    expect(resolution.clarification).toBe(
      'Which rulebook should I use: AKC Scent Work, UKC Nosework?'
    );
  });

  it('asks for clarification for an ambiguous rules question with no registry named', () => {
    const resolution = resolveRulebookContext({
      allRulebooks: rulebooks,
      showRulebooks: [],
      hasVerifiedShowContext: false,
      message: "What's the max time in Excellent Containers?",
    });

    expect(resolution.rulebooks).toEqual([]);
    expect(resolution.clarification).toBe(
      'Which rulebook should I use: AKC Scent Work, UKC Nosework?'
    );
  });

  it('resolves an explicit AKC or UKC rulebook outside show context', () => {
    expect(
      resolveRulebookContext({
        allRulebooks: rulebooks,
        showRulebooks: [],
        hasVerifiedShowContext: false,
        rulebookScope: { organizationCode: 'AKC', sportCode: 'Scent Work' },
      })
    ).toEqual({ rulebooks: [rulebooks[0]], clarification: null });

    expect(
      resolveRulebookContext({
        allRulebooks: rulebooks,
        showRulebooks: [],
        hasVerifiedShowContext: false,
        rulebookScope: { organizationCode: 'UKC', sportCode: 'Nosework' },
      })
    ).toEqual({ rulebooks: [rulebooks[1]], clarification: null });
  });

  it('resolves explicit registry text in the rules question', () => {
    expect(
      resolveRulebookContext({
        allRulebooks: rulebooks,
        showRulebooks: [],
        hasVerifiedShowContext: false,
        message: 'What is the max time in AKC Excellent Containers?',
      })
    ).toEqual({ rulebooks: [rulebooks[0]], clarification: null });
  });

  it('prevents explicit scope from escaping verified show rulebooks', () => {
    const resolution = resolveRulebookContext({
      allRulebooks: rulebooks,
      showRulebooks: [rulebooks[0]],
      hasVerifiedShowContext: true,
      rulebookScope: { organizationCode: 'UKC', sportCode: 'Nosework' },
    });

    expect(resolution.rulebooks).toEqual([]);
    expect(resolution.clarification).toContain("this show's verified trials");
    expect(resolution.clarification).toContain('AKC Scent Work');
  });

  it('does not ask which rulebook when the show has none to choose from', () => {
    expect(
      resolveRulebookContext({
        allRulebooks: rulebooks,
        showRulebooks: [],
        hasVerifiedShowContext: true,
        message: 'What is the max time?',
      })
    ).toEqual({ rulebooks: [], clarification: null });
  });
});
