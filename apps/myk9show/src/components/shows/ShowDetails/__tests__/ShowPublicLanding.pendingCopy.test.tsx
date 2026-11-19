import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { act } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { usePendingEntryCopy } from '@/features/_shared/landing/PendingEntryCopyContext';
import { ShowPublicLanding } from '../ShowPublicLanding';
import type { Show } from '@/types/show-types';

vi.mock('@/features/heritage/landing/HeritageLandingPage', () => ({
  HeritageLandingPage: () => {
    const copy = usePendingEntryCopy();
    return <div data-testid="heritage-landing">{copy.sentence}</div>;
  },
}));

describe('ShowPublicLanding pending-entry copy', () => {
  it('provides the dated copy to the style page', () => {
    const show = {
      id: 'show-1',
      name: 'Test Show',
      style: 'heritage',
      onlineEntriesEnabled: true,
      entryOpenDate: '2099-01-05T00:00:00+00:00',
    } as unknown as Show;
    render(
      <ShowPublicLanding
        show={show}
        landingTrials={[]}
        hasEntryClassInventory
        entryPendingReason="not_yet_open"
      />
    );
    expect(screen.getByTestId('heritage-landing')).toHaveTextContent('Entries open January 5.');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops the dated copy once the opening day arrives while the page stays mounted', () => {
    vi.useFakeTimers();
    // 23:00 on Nov 17 in Chicago; the entry window opens Nov 18 (Chicago).
    vi.setSystemTime(new Date('2026-11-18T05:00:00Z'));
    const show = {
      id: 'show-1',
      name: 'Test Show',
      style: 'heritage',
      onlineEntriesEnabled: true,
      entryOpenDate: '2026-11-18',
    } as unknown as Show;
    render(
      <ShowPublicLanding
        show={show}
        landingTrials={[{ id: 't1', timezone: 'America/Chicago' } as never]}
        hasEntryClassInventory
        entryPendingReason="not_yet_open"
      />
    );
    expect(screen.getByTestId('heritage-landing')).toHaveTextContent('Entries open November 18.');

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    });
    expect(screen.getByTestId('heritage-landing')).toHaveTextContent('Entries are not open yet.');
  });
});
