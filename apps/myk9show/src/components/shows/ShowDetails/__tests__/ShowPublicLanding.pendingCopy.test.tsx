import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { describe, it, expect, vi } from 'vitest';
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
});
