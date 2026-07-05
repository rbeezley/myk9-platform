import { describe, it, expect } from 'vitest';
import {
  resolveRegistrationExit,
  resolveRegistrationExitPath,
  resolveRegistrationCompletionPath,
} from './RegistrationWizardPage.routes';

describe('resolveRegistrationExit (UX walk 4.D — labels tell the truth)', () => {
  it('exhibitor self-service exits to the show page with an honest label', () => {
    const target = resolveRegistrationExit('show-1', {
      isLateEntryMode: false,
      isInsideSidebar: false,
    });
    expect(target).toEqual({ path: '/shows/show-1', label: 'Back to show' });
  });

  it('show-desk late entry exits to the Show Desk and names it', () => {
    const target = resolveRegistrationExit('show-1', {
      isLateEntryMode: true,
      isInsideSidebar: true,
    });
    expect(target).toEqual({ path: '/shows/show-1/show-desk', label: 'Back to Show Desk' });
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
    expect(target.label).toBe('Back to Show Desk');
  });

  it('encodes the show id in the destination path', () => {
    const target = resolveRegistrationExit('a/b show', {
      isLateEntryMode: false,
      isInsideSidebar: false,
    });
    expect(target.path).toBe('/shows/a%2Fb%20show');
  });
});

describe('resolveRegistrationExitPath / CompletionPath (unchanged by 4.D)', () => {
  it('exit path is null for non-late entry, show-desk for late entry', () => {
    expect(resolveRegistrationExitPath('s1', false)).toBeNull();
    expect(resolveRegistrationExitPath('s1', true)).toBe('/shows/s1/show-desk');
  });

  it('completion lands on the show page normally, show-desk for late entry', () => {
    expect(resolveRegistrationCompletionPath('s1', false)).toBe('/shows/s1');
    expect(resolveRegistrationCompletionPath('s1', true)).toBe('/shows/s1/show-desk');
  });
});
