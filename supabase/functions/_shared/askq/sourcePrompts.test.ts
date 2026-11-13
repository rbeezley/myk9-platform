// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ASKQ_GUIDES, ASKQ_RULEBOOKS } from './documentAssets.ts';
import { buildGuidesPrompt, buildRulebookPrompt, buildShowDataPrompt } from './sourcePrompts.ts';
import type { UserContext } from './types.ts';

const userContext: UserContext = {
  userId: 'u',
  displayName: null,
  dogs: [],
  showId: 'show-1',
  showName: 'Heartland Classic',
  showRegistries: ['AKC Scent Work'],
};
const akc = ASKQ_RULEBOOKS.filter(rulebook => rulebook.id === 'akc-scent-work');

describe('per-source prompts hold only their own source', () => {
  it('guides: role-scoped guides, quote format, no rulebook, no tools text', () => {
    const exhibitor = buildGuidesPrompt({
      userContext,
      hasStaffRole: false,
      allGuides: ASKQ_GUIDES,
    });
    expect(exhibitor.guides.map(guide => guide.id)).toEqual([
      'exhibitor-guide',
      'judge-steward-quickstart',
    ]);
    expect(exhibitor.systemPrompt).toContain('SUPPORT_ANSWER');
    expect(exhibitor.systemPrompt).not.toContain('<selected_rulebook');
    const staff = buildGuidesPrompt({ userContext, hasStaffRole: true, allGuides: ASKQ_GUIDES });
    expect(staff.guides).toEqual(ASKQ_GUIDES);
  });

  it('rulebook: the selected rulebook and its label, no guides', () => {
    const prompt = buildRulebookPrompt({ userContext, rulebooks: akc });
    expect(prompt).toContain('<selected_rulebook id="akc-scent-work"');
    expect(prompt).toContain('"Using AKC Scent Work rules:"');
    expect(prompt).not.toContain('<guide id=');
  });

  it('show data: neither guide nor rulebook text, and no instruction to switch', () => {
    const prompt = buildShowDataPrompt({ userContext });
    expect(prompt).not.toContain('<guide id=');
    expect(prompt).not.toContain('<selected_rulebook');
    expect(prompt).not.toMatch(/switch/i);
  });
});
