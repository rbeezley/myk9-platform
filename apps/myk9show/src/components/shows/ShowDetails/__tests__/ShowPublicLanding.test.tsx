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
  }: {
    show: { style?: string | null };
    trial: { id?: string } | null;
    allTrials: { id: string }[];
    hasEntryClassInventory?: boolean | null;
  }) => (
    <div
      data-testid="monogram-landing"
      data-style={show?.style ?? 'null'}
      data-trial={trial?.id ?? 'none'}
      data-all={allTrials.length}
      data-inventory={String(hasEntryClassInventory)}
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
    render(<ShowPublicLanding show={makeShow({ style: 'heritage' })} landingTrials={[]} hasEntryClassInventory={null} />);
    expect(screen.getByTestId('heritage-landing')).toBeInTheDocument();
  });

  it('renders a different styled landing for a different style', () => {
    render(<ShowPublicLanding show={makeShow({ style: 'banner' })} landingTrials={[]} hasEntryClassInventory={null} />);
    expect(screen.getByTestId('banner-landing')).toBeInTheDocument();
    expect(screen.queryByTestId('monogram-landing')).toBeNull();
  });

  it('falls back to the Monogram default for a null style', () => {
    render(<ShowPublicLanding show={makeShow({ style: null })} landingTrials={[]} hasEntryClassInventory={null} />);
    expect(screen.getByTestId('monogram-landing')).toBeInTheDocument();
  });

  it('falls back to the Monogram default for a "default" style', () => {
    render(<ShowPublicLanding show={makeShow({ style: 'default' })} landingTrials={[]} hasEntryClassInventory={null} />);
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
      />
    );
    const landing = screen.getByTestId('monogram-landing');
    expect(landing).toHaveAttribute('data-trial', 't1');
    expect(landing).toHaveAttribute('data-all', '2');
    expect(landing).toHaveAttribute('data-inventory', 'true');
  });

  it('passes a null trial when there are no landing trials', () => {
    render(<ShowPublicLanding show={makeShow({ style: null })} landingTrials={[]} hasEntryClassInventory={null} />);
    expect(screen.getByTestId('monogram-landing')).toHaveAttribute('data-trial', 'none');
  });
});
