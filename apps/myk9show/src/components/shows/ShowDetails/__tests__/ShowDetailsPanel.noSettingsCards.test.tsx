/**
 * MYK9-1682: the venue pin, Wi-Fi, withdrawal policy and refund-all moved to the Edit show
 * panel's Venue & policies tab, so the header details panel no longer renders them.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowDetailsPanel } from '../ShowDetailsPanel';
import type { Show } from '@/types/show-types';

vi.mock('@/components/shows/overview/QuickInfoCards', () => ({ QuickInfoCards: () => null }));
vi.mock('@/features/premium/PremiumDownloadCard', () => ({ PremiumDownloadCard: () => null }));
vi.mock('@/features/premium/LandingPageCard', () => ({ LandingPageCard: () => null }));
vi.mock('@/components/shows/overview/AboutThisShowCard', () => ({ AboutThisShowCard: () => null }));

describe('ShowDetailsPanel', () => {
  it.each(['published', 'cancelled'])('renders no settings cards for a %s show', status => {
    const show = { id: 's1', name: 'Show', status } as unknown as Show;
    render(<ShowDetailsPanel show={show} canManageShow entryCount={0} open showPublishing />);
    expect(screen.getByRole('region', { name: 'Show details' })).toBeInTheDocument();
    expect(screen.queryByTestId('show-settings-cards')).not.toBeInTheDocument();
    expect(screen.queryByText('Venue WiFi')).not.toBeInTheDocument();
    expect(screen.queryByText('Venue Map Pin')).not.toBeInTheDocument();
    expect(screen.queryByText('Refund all entries')).not.toBeInTheDocument();
  });
});
