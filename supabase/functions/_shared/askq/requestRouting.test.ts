import { describe, expect, it } from 'vitest';
import { buildModePrompt, parseAskQRouting, resolveRulebookContext } from './requestRouting.ts';
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
    expect(parseAskQRouting(undefined, undefined, false)).toEqual({
      ok: true,
      questionMode: null,
    });
  });

  it('maps existing supportMode callers to app-help mode', () => {
    expect(parseAskQRouting(undefined, undefined, true)).toEqual({
      ok: true,
      questionMode: 'app-help',
    });
  });

  it('validates selected question mode and rulebook scope', () => {
    expect(
      parseAskQRouting('rules', { organizationCode: 'akc', sportCode: 'Scent Work' }, false)
    ).toEqual({
      ok: true,
      questionMode: 'rules',
      rulebookScope: { organizationCode: 'AKC', sportCode: 'Scent Work' },
    });

    expect(parseAskQRouting('other', undefined, false)).toEqual({
      ok: false,
      error: 'Invalid questionMode',
    });
    expect(parseAskQRouting('rules', { organizationCode: 12 }, false)).toEqual({
      ok: false,
      error: 'Invalid rulebookScope',
    });
  });

  it('asks for clarification when rules mode has multiple possible rulebooks', () => {
    const resolution = resolveRulebookContext({
      allRulebooks: rulebooks,
      showRulebooks: [],
      hasVerifiedShowContext: false,
      questionMode: 'rules',
    });

    expect(resolution.rulebooks).toEqual([]);
    expect(resolution.clarification).toBe(
      'Which rulebook should I use: AKC Scent Work, UKC Nosework?'
    );
  });

  it('asks for clarification when omitted-mode text is an ambiguous rules question', () => {
    const resolution = resolveRulebookContext({
      allRulebooks: rulebooks,
      showRulebooks: [],
      hasVerifiedShowContext: false,
      questionMode: null,
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
        questionMode: 'rules',
        rulebookScope: { organizationCode: 'AKC', sportCode: 'Scent Work' },
      })
    ).toEqual({ rulebooks: [rulebooks[0]], clarification: null });

    expect(
      resolveRulebookContext({
        allRulebooks: rulebooks,
        showRulebooks: [],
        hasVerifiedShowContext: false,
        questionMode: 'rules',
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
        questionMode: 'rules',
        message: 'What is the max time in AKC Excellent Containers?',
      })
    ).toEqual({ rulebooks: [rulebooks[0]], clarification: null });
  });

  it('prevents explicit scope from escaping verified show rulebooks', () => {
    const resolution = resolveRulebookContext({
      allRulebooks: rulebooks,
      showRulebooks: [rulebooks[0]],
      hasVerifiedShowContext: true,
      questionMode: 'rules',
      rulebookScope: { organizationCode: 'UKC', sportCode: 'Nosework' },
    });

    expect(resolution.rulebooks).toEqual([]);
    expect(resolution.clarification).toContain("this show's verified trials");
    expect(resolution.clarification).toContain('AKC Scent Work');
  });

  it('keeps mode prompt constraints distinct', () => {
    expect(buildModePrompt('rules')).toContain('Answer only from selected_rulebook');
    expect(buildModePrompt('show-data')).toContain('Use live show-data tools');
    expect(buildModePrompt('app-help')).toContain('Answer only from verified_user_guides');
  });
});
