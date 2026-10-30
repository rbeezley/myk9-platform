/**
 * MYK9-1500: tab close and back-out-of-the-app are held by `beforeunload`, but
 * only while the sheet has something to lose.
 */
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScoresheetLeaveGuard } from './ScoresheetLeaveGuard';

function unloadIsPrevented(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('ScoresheetLeaveGuard beforeunload', () => {
  it('is not registered for a clean sheet', () => {
    render(<ScoresheetLeaveGuard isDirty={false} />);
    expect(unloadIsPrevented()).toBe(false);
  });

  it('is registered while dirty and removed again once clean or unmounted', () => {
    const { rerender, unmount } = render(<ScoresheetLeaveGuard isDirty />);
    expect(unloadIsPrevented()).toBe(true);

    rerender(<ScoresheetLeaveGuard isDirty={false} />);
    expect(unloadIsPrevented()).toBe(false);

    rerender(<ScoresheetLeaveGuard isDirty />);
    unmount();
    expect(unloadIsPrevented()).toBe(false);
  });
});
