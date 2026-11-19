import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Show } from '@/types/show-types';
import ShowAboutPage from '../ShowAboutPage';

const harness = vi.hoisted(() => ({
  canManageShow: true,
  blockers: { status: 'ready', blockers: [] } as unknown,
}));

vi.mock('@/features/publishing/usePublishBlockers', () => ({
  showPublishBlockersQueryKey: (id: string) => ['shows', id, 'publish-blockers'],
  usePublishBlockers: () => harness.blockers,
}));
vi.mock('@/components/shows/ShowDetails/showManagementOutlet', () => ({
  useShowManagementOutlet: () => ({
    show: { id: 'show-1', name: 'Heartland Classic', clubId: 'club-1' } as unknown as Show,
    canManageShow: harness.canManageShow,
    judges: [],
    managerEntryCount: 0,
    trials: [],
    classes: [],
  }),
}));
vi.mock('@/features/premium/PremiumDownloadCard', () => ({ PremiumDownloadCard: () => null }));
vi.mock('@/features/premium/LandingPageCard', () => ({ LandingPageCard: () => null }));
vi.mock('@/features/premium/usePremiumRequirements', () => ({
  usePremiumRequirements: () => ({ items: [], registry: null }),
}));
vi.mock('@/features/show-workbench/useShowWithLiveUses', () => ({
  useShowWithLiveUses: (show: unknown) => show,
}));
vi.mock('@/components/shows/about/ShowAboutFacts', () => ({
  ShowAboutEntries: () => null,
  ShowAboutWhere: () => null,
  ShowAboutWithdrawal: () => null,
}));
vi.mock('@/components/shows/overview/AboutThisShowCard', () => ({
  AboutThisShowCard: () => null,
}));
vi.mock('@/components/shows/about/ShowAboutAccessCodesLink', () => ({
  ShowAboutAccessCodesLink: () => null,
}));

describe('ShowAboutPage publish blockers (MYK9-2198)', () => {
  beforeEach(() => {
    harness.canManageShow = true;
    harness.blockers = {
      status: 'ready',
      blockers: [{ key: 'entry_dates_missing', waitingOn: 'secretary', eta: null }],
    };
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('shows "Before you can publish" with the server lines, linking to the entry dates', () => {
    render(<ShowAboutPage />);

    expect(screen.getByText('Before you can publish')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /fix it: set when entries open/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/shows/show-1')
    );
  });

  it('shows nothing when the list is empty', () => {
    harness.blockers = { status: 'ready', blockers: [] };
    render(<ShowAboutPage />);

    expect(screen.queryByText('Before you can publish')).not.toBeInTheDocument();
  });
});
