import { describe, expect, it, vi } from 'vitest';
import { releaseOnPageRestore } from './releaseOnPageRestore';

function pageShow(persisted: boolean): Event {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}

describe('releaseOnPageRestore', () => {
  it('frees the Pay button once when Back from Stripe restores the page from cache', () => {
    const release = vi.fn();
    releaseOnPageRestore(release);

    window.dispatchEvent(pageShow(false));
    expect(release).not.toHaveBeenCalled();

    window.dispatchEvent(pageShow(true));
    window.dispatchEvent(pageShow(true));
    expect(release).toHaveBeenCalledTimes(1);
  });
});
