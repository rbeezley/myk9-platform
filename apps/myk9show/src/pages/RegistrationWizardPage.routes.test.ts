import { describe, it, expect } from 'vitest';
import {
  resolveRegistrationExit,
  resolveRegistrationExitPath,
  resolveRegistrationCompletionPath,
  STAFF_RECEIPT_DONE_LABEL,
} from './RegistrationWizardPage.routes';

describe('resolveRegistrationExit (UX walk 4.D — labels tell the truth)', () => {
  it('exhibitor self-service exits to the show page with an honest label', () => {
    const target = resolveRegistrationExit('show-1', {
      isLateEntryMode: false,
      isInsideSidebar: false,
    });
    expect(target).toEqual({ path: '/shows/show-1', label: 'Back to show' });
  });

  // MYK9-954: the late-entry door moved from Show Day's Tools to Entries.
  it('late entry exits to Entries, where it was started, and names it', () => {
    const target = resolveRegistrationExit('show-1', {
      isLateEntryMode: true,
      isInsideSidebar: true,
    });
    expect(target).toEqual({ path: '/shows/show-1/entries', label: 'Back to Entries' });
  });

  it('secretary "Add entries" falls back to history with a generic label', () => {
    // Origin varies within the secretary surface, so path is null (navigate(-1))
    // and the label stays honestly generic rather than claiming a destination.
    const target = resolveRegistrationExit('show-1', {
      isLateEntryMode: false,
      isInsideSidebar: true,
    });
    expect(target).toEqual({ path: null, label: 'Back' });
  });

  it('late entry wins over sidebar flag when both are set the other way', () => {
    // Late entry is the most specific mode; it takes precedence.
    const target = resolveRegistrationExit('show-1', {
      isLateEntryMode: true,
      isInsideSidebar: false,
    });
    expect(target.label).toBe('Back to Entries');
  });

  it('encodes the show id in the destination path', () => {
    const target = resolveRegistrationExit('a/b show', {
      isLateEntryMode: false,
      isInsideSidebar: false,
    });
    expect(target.path).toBe('/shows/a%2Fb%20show');
  });
});

describe('resolveRegistrationExitPath / CompletionPath', () => {
  it('exit path is null for non-late entry, Entries for late entry', () => {
    expect(resolveRegistrationExitPath('s1', false)).toBeNull();
    expect(resolveRegistrationExitPath('s1', true)).toBe('/shows/s1/entries');
  });

  it('completion lands on the show page normally, Entries for late entry', () => {
    expect(resolveRegistrationCompletionPath('s1', false)).toBe('/shows/s1');
    expect(resolveRegistrationCompletionPath('s1', true)).toBe('/shows/s1/entries');
  });

  it('completion returns secretary mail-in entries to Entry Management', () => {
    expect(resolveRegistrationCompletionPath('s1', false, true)).toBe('/shows/s1/entries');
  });
});

// Review of #2681: the late-entry receipt still said "Return to Show Desk"
// after its completion path moved to Entries. Staff receipts now all finish on
// Entries, so one label names that destination.
describe('staff receipt label', () => {
  it('names Entry Management, where both staff completions land', () => {
    expect(resolveRegistrationCompletionPath('s1', true)).toBe('/shows/s1/entries');
    expect(resolveRegistrationCompletionPath('s1', false, true)).toBe('/shows/s1/entries');
    expect(STAFF_RECEIPT_DONE_LABEL).toBe('Return to Entry Management');
  });
});
