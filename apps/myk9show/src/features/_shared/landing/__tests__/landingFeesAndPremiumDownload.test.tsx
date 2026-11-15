/**
 * MYK9-2041: every public landing style prints the show's pre-entry and day-of fees, and
 * offers "Download premium (PDF)" exactly when a premium PDF is published. Renders the REAL
 * pages; only the Supabase transport is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { render } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import { PREMIUM_DOWNLOAD_LABEL } from '@/features/_shared/landing/PremiumDownloadSection';
import { FinalCtaSection } from '@/features/fieldGuide/landing/sections/FinalCtaSection';
import type { PremiumStyle } from '@/types/premium-types';

interface PageProps {
  show: Show;
  trial: Trial;
  allTrials: Trial[];
}

const STYLES = Object.entries(STYLED_LANDING_BY_STYLE) as Array<
  [PremiumStyle, ComponentType<PageProps>]
>;

const baseShow = {
  id: '6f1c2b8e-1d2a-4c3b-9e4f-5a6b7c8d9e0f',
  name: 'Heartland Scent Work Classic',
  organization: 'Heartland Dog Club',
  preEntryFee: 32,
  dayOfShowFee: 47,
} as Show;

const publishedShow = {
  ...baseShow,
  publishedPremiumPath: `${baseShow.id}/0b8d3c1e-2f4a-4b5c-8d6e-7f8a9b0c1d2e.pdf`,
  publishedPremiumAt: '2026-07-01T12:00:00Z',
} as Show;

const trial = {
  id: 'trial-1',
  showId: baseShow.id,
  showName: baseShow.name,
  trialDate: '2026-08-01',
  trialNumber: 'Trial 1',
  status: 'no-status',
} as unknown as Trial;

const SIGNED_URL = 'https://storage.example.test/premium.pdf?token=abc';

describe.each(STYLES)('%s landing fees and premium download (MYK9-2041)', (_style, Page) => {
  beforeEach(() => {
    mockViewportWidth(1280);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the pre-entry and day-of fees', () => {
    const { container } = render(<Page show={baseShow} trial={trial} allTrials={[trial]} />);
    // Some styles split dollars from cents across elements, so read the whole text.
    const text = container.textContent ?? '';
    expect(text).toMatch(/\$\s*32(\.00)?/);
    expect(text).toMatch(/\$\s*47(\.00)?/);
  });

  it('offers no premium download when no PDF is published', () => {
    render(<Page show={baseShow} trial={trial} allTrials={[trial]} />);
    expect(screen.queryByRole('button', { name: PREMIUM_DOWNLOAD_LABEL })).toBeNull();
    expect(screen.queryByTestId('landing-premium-download')).toBeNull();
  });

  it('offers one premium download that opens the published file', async () => {
    const pendingTab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(pendingTab as unknown as Window);
    mockSupabase.functions.invoke.mockResolvedValueOnce({ data: { url: SIGNED_URL }, error: null });

    render(<Page show={publishedShow} trial={trial} allTrials={[trial]} />);
    const buttons = screen.getAllByRole('button', { name: PREMIUM_DOWNLOAD_LABEL });
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]!);

    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank');
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('get-premium-download', {
      body: { show_id: publishedShow.id },
    });
    await waitFor(() => expect(pendingTab.location.href).toBe(SIGNED_URL));
    expect(pendingTab.opener).toBeNull();
    expect(pendingTab.close).not.toHaveBeenCalled();
  });
});

describe('premium download failure (MYK9-2041)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes the pending tab and says so when the file cannot be had', async () => {
    const pendingTab = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(pendingTab as unknown as Window);
    mockSupabase.functions.invoke.mockResolvedValueOnce({ data: null, error: { message: 'no' } });
    const Page = STYLED_LANDING_BY_STYLE.poster as ComponentType<PageProps>;

    render(<Page show={publishedShow} trial={trial} allTrials={[trial]} />);
    fireEvent.click(screen.getByRole('button', { name: PREMIUM_DOWNLOAD_LABEL }));

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be opened');
    expect(pendingTab.close).toHaveBeenCalled();
    expect(pendingTab.location.href).toBe('');
  });
});

describe('Field Guide closing section (MYK9-2041)', () => {
  it('makes no refund promise of its own', () => {
    render(
      <FinalCtaSection
        entryWizardUrl="/shows/show-1/register"
        classesHref={null}
        entryCloseDate="2099-06-10"
        timezone="America/New_York"
        entryLimit={null}
        canEnterOnline
      />
    );
    expect(screen.getByText('First-received basis.')).toBeInTheDocument();
    expect(screen.queryByText(/refund/i)).toBeNull();
  });
});
