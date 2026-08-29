import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShowPublicLanding } from '../ShowPublicLanding';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';

// Stub the styled landing pages the registry maps to. We exercise the REAL
// getShowStyle + STYLED_LANDING_BY_STYLE so the null/default → Monogram fallback
// is genuinely covered; the stubs only echo the props they receive.
vi.mock('@/features/heritage/landing/HeritageLandingPage', () => ({
  HeritageLandingPage: ({ show }: { show: { style?: string | null } }) => (
    <div data-testid="heritage-landing" data-style={show?.style ?? 'null'}>
      heritage
    </div>
  ),
}));
vi.mock('@/features/banner/landing/BannerLandingPage', () => ({
  BannerLandingPage: ({ show }: { show: { style?: string | null } }) => (
    <div data-testid="banner-landing" data-style={show?.style ?? 'null'}>
      banner
    </div>
  ),
}));
vi.mock('@/features/monogram/landing/MonogramLandingPage', () => ({
  MonogramLandingPage: ({
    show,
    trial,
    allTrials,
    hasEntryClassInventory,
    entryNotYetOpen,
  }: {
    show: { style?: string | null };
    trial: { id?: string } | null;
    allTrials: { id: string }[];
    hasEntryClassInventory?: boolean | null;
    entryNotYetOpen?: boolean;
  }) => (
    <div
      data-testid="monogram-landing"
      data-style={show?.style ?? 'null'}
      data-trial={trial?.id ?? 'none'}
      data-all={allTrials.length}
      data-inventory={String(hasEntryClassInventory)}
      data-not-yet-open={String(entryNotYetOpen)}
    >
      monogram
    </div>
  ),
}));

function makeShow(overrides: Partial<Show> = {}): Show {
  return { id: 'show-1', name: 'Test Show', ...overrides } as Show;
}

function makeTrial(id: string): Trial {
  return { id } as unknown as Trial;
}

describe('ShowPublicLanding', () => {
  it('renders the styled landing matching the show style', () => {
    render(
      <ShowPublicLanding
        show={makeShow({ style: 'heritage' })}
        landingTrials={[]}
        hasEntryClassInventory={null}
        entryNotYetOpen={false}
      />
    );
    expect(screen.getByTestId('heritage-landing')).toBeInTheDocument();
  });

  it('renders a different styled landing for a different style', () => {
    render(
      <ShowPublicLanding
        show={makeShow({ style: 'banner' })}
        landingTrials={[]}
        hasEntryClassInventory={null}
        entryNotYetOpen={false}
      />
    );
    expect(screen.getByTestId('banner-landing')).toBeInTheDocument();
    expect(screen.queryByTestId('monogram-landing')).toBeNull();
  });

  it('falls back to the Monogram default for a null style', () => {
    render(
      <ShowPublicLanding
        show={makeShow({ style: null })}
        landingTrials={[]}
        hasEntryClassInventory={null}
        entryNotYetOpen={false}
      />
    );
    expect(screen.getByTestId('monogram-landing')).toBeInTheDocument();
  });

  it('falls back to the Monogram default for a "default" style', () => {
    render(
      <ShowPublicLanding
        show={makeShow({ style: 'default' })}
        landingTrials={[]}
        hasEntryClassInventory={null}
        entryNotYetOpen={false}
      />
    );
    expect(screen.getByTestId('monogram-landing')).toBeInTheDocument();
  });

  it('uses the published experience style over the show draft style', () => {
    render(
      <ShowPublicLanding
        show={makeShow({
          style: 'poster',
          experienceIsPublished: true,
          experiencePublishedStyle: 'heritage',
        })}
        landingTrials={[]}
        hasEntryClassInventory={null}
        entryNotYetOpen={false}
      />
    );
    const landing = screen.getByTestId('heritage-landing');
    expect(landing).toBeInTheDocument();
    // The show handed to the landing carries the published style, not 'poster'.
    expect(landing).toHaveAttribute('data-style', 'heritage');
  });

  it('passes the first landing trial, all trials, and inventory flag through', () => {
    render(
      <ShowPublicLanding
        show={makeShow({ style: null })}
        landingTrials={[makeTrial('t1'), makeTrial('t2')]}
        hasEntryClassInventory={true}
        entryNotYetOpen={false}
      />
    );
    const landing = screen.getByTestId('monogram-landing');
    expect(landing).toHaveAttribute('data-trial', 't1');
    expect(landing).toHaveAttribute('data-all', '2');
    expect(landing).toHaveAttribute('data-inventory', 'true');
  });

  /**
   * The not-yet-open signal has to REACH the variant, because that is where the
   * entry CTA is gated. The landings only ever checked `entryClosed`, so a show
   * opening months from now advertised "Enter This Show" and dead-ended the
   * visitor. Asserting on getEntryStatus alone would be vacuous -- that function
   * was already correct and untouched; the defect was that its answer never got
   * this far.
   */
  it('passes entryNotYetOpen through to the styled landing', () => {
    render(
      <ShowPublicLanding
        show={makeShow({ style: null })}
        landingTrials={[makeTrial('t1')]}
        hasEntryClassInventory={true}
        entryNotYetOpen={true}
      />
    );
    expect(screen.getByTestId('monogram-landing')).toHaveAttribute('data-not-yet-open', 'true');
  });

  it('passes entryNotYetOpen=false through unchanged', () => {
    render(
      <ShowPublicLanding
        show={makeShow({ style: null })}
        landingTrials={[makeTrial('t1')]}
        hasEntryClassInventory={true}
        entryNotYetOpen={false}
      />
    );
    expect(screen.getByTestId('monogram-landing')).toHaveAttribute('data-not-yet-open', 'false');
  });

  it('passes a null trial when there are no landing trials', () => {
    render(
      <ShowPublicLanding
        show={makeShow({ style: null })}
        landingTrials={[]}
        hasEntryClassInventory={null}
        entryNotYetOpen={false}
      />
    );
    expect(screen.getByTestId('monogram-landing')).toHaveAttribute('data-trial', 'none');
  });
});
