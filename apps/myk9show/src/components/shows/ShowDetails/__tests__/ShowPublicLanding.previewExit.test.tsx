import { useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { render, screen } from '@/test/utils/testUtils';
import { ShowPublicLanding } from '../ShowPublicLanding';

// MYK9-856: opening show Preview from setup (the Premium edit tab, or the
// Landing Page card on Overview) left the secretary with no way back — no
// exit control on the full-page preview, so Escape did nothing and a
// secretary with no browser chrome (an installed PWA) had no fallback
// either. These tests pin the fix: a visible "Back to setup" control that
// works by click and by Escape, landing on the setup step `returnTo` names.

vi.mock('@/features/entitlement/useEntitlement', () => ({
  useEntitlement: () => ({
    canAuthorizePremium: true,
    isLoading: false,
    isTrusted: true,
    effective: null,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/features/monogram/landing/MonogramLandingPage', () => ({
  MonogramLandingPage: () => <div data-testid="monogram-landing" />,
}));

function makeShow(overrides: Partial<Show> = {}): Show {
  return { id: 'show-1', name: 'Test Show', style: null, ...overrides } as Show;
}

function makeTrial(id: string): Trial {
  return { id } as unknown as Trial;
}

/** Renders the current location's path + query so navigation is observable. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPreview(initialRoute: string) {
  return render(
    <>
      <LocationProbe />
      <ShowPublicLanding
        show={makeShow()}
        landingTrials={[makeTrial('trial-1')]}
        hasEntryClassInventory={null}
        entryWindowNotOpen={false}
        styleMode="manager-draft-preview"
        onSaveDraftStyle={vi.fn().mockResolvedValue(undefined)}
      />
    </>,
    { initialRoute }
  );
}

describe('show Preview exit (MYK9-856)', () => {
  it('shows a visible, labelled exit at the top of the preview', () => {
    renderPreview('/shows/show-1?preview=public&returnTo=%2Fshows%2Fshow-1%3Fedit%3Dtrue');

    expect(screen.getByRole('link', { name: 'Back to setup' })).toBeInTheDocument();
  });

  it('leaves preview for the setup step returnTo names when the exit button is clicked', async () => {
    const { user } = renderPreview(
      '/shows/show-1?preview=public&returnTo=%2Fshows%2Fshow-1%3Fedit%3Dtrue%26editTab%3Dpremium'
    );

    await user.click(screen.getByRole('link', { name: 'Back to setup' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/shows/show-1?edit=true&editTab=premium');
  });

  it('leaves preview for the setup step returnTo names when Escape is pressed', async () => {
    const { user } = renderPreview(
      '/shows/show-1?preview=public&returnTo=%2Fshows%2Fshow-1%3Fedit%3Dtrue%26editTab%3Dpremium'
    );

    await user.keyboard('{Escape}');

    expect(screen.getByTestId('location')).toHaveTextContent('/shows/show-1?edit=true&editTab=premium');
  });

  it('falls back to the show overview when returnTo is missing or untrusted', async () => {
    const { user } = renderPreview(
      '/shows/show-1?preview=public&returnTo=https%3A%2F%2Fevil.example%2Fsteal'
    );

    await user.click(screen.getByRole('link', { name: 'Back to setup' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/shows/show-1');
    expect(screen.getByTestId('location')).not.toHaveTextContent('evil.example');
  });
});
