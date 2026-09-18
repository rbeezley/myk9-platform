import { describe, expect, it } from 'vitest';
import { resolveWizardTitles } from './wizardTitles';

/**
 * Pins the wizard's titles against the vocabulary standard
 * (docs/reference/ui-vocabulary.md). The e2e specs that also assert these
 * headings only run against staging, so without this a rename reaches review
 * with every local check green.
 */
describe('resolveWizardTitles', () => {
  it('names the exhibitor front door, with no on-behalf sub-line', () => {
    expect(resolveWizardTitles({ isLateEntryMode: false, isInsideSidebar: false })).toEqual({
      workflowLabel: 'Register',
      sidebarTitle: 'Register for Show',
      workflowSubtitle: undefined,
    });
  });

  it('names WHOSE dog, never why, when entering on behalf of an exhibitor', () => {
    const titles = resolveWizardTitles({ isLateEntryMode: false, isInsideSidebar: true });

    expect(titles).toEqual({
      workflowLabel: 'Entry for someone else',
      sidebarTitle: 'Add entry for someone else',
      workflowSubtitle: 'Enter on behalf of an exhibitor.',
    });
    // "Mail-in" was one reason among several (a phone call, a walk-up, fixing
    // an exhibitor's mistake) for the identical action. Naming it made the
    // rest look unsupported.
    expect(titles.sidebarTitle).not.toMatch(/mail-in/i);
  });

  it('keeps the late-entry modifier, because late entry is a different operation', () => {
    // It exits to the Show Desk, switches to the offline-first create path and
    // drops the client-side fullness check, so the secretary has to be able to
    // see which mode they are in. Contrast the case above, where the modifier
    // changed nothing the software did. (The entry-close deadline is exempted
    // by RBAC, not by this mode -- see entryCloseGuard.ts.)
    expect(resolveWizardTitles({ isLateEntryMode: true, isInsideSidebar: true })).toEqual({
      workflowLabel: 'Late entry',
      sidebarTitle: 'Add late entry',
      workflowSubtitle: 'Enter on behalf of an exhibitor.',
    });
  });

  it('lets late-entry mode win over the sidebar branch', () => {
    // The exhibitor route never sets entryMode=late, but the precedence is
    // load-bearing: a mislabelled deadline bypass is the failure that matters.
    expect(
      resolveWizardTitles({ isLateEntryMode: true, isInsideSidebar: false }).sidebarTitle
    ).toBe('Add late entry');
  });
});
