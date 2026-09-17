import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { StickyNav } from '../sections/StickyNav';
import { HeroBlock } from '../sections/HeroBlock';
import { FinalCtaBand } from '../sections/FinalCtaBand';

/** Sets window.matchMedia to answer `matches` for every query (used to flip
 * FinalCtaBand's `(max-width: 639px)` check between mobile and desktop). */
function mockViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('Monogram entry CTAs', () => {
  afterEach(() => {
    mockViewport(false);
  });

  it('replaces the sticky enter link when classes are not ready', () => {
    render(
      <StickyNav
        clubName="Monogram Kennel Club"
        monogramLetters="MKC"
        entryWizardUrl="/shows/show-1/register"
        canEnterOnline={false}
      />
    );

    expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
    expect(screen.getByText(/classes pending/i)).toBeInTheDocument();
  });

  it('replaces the sticky enter link when entries are closed', () => {
    render(
      <StickyNav
        clubName="Monogram Kennel Club"
        monogramLetters="MKC"
        entryWizardUrl="/shows/show-1/register"
        canEnterOnline={false}
        entryClosed
      />
    );

    expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
    expect(screen.getByText(/entries closed/i)).toBeInTheDocument();
  });

  /**
   * MYK9-565: the hero used to render its own "Enter this show" / "Enter
   * your dog" CTA — the middle of the three a human tester counted (top /
   * middle / bottom, inconsistent copy). The sticky nav's CTA is now the
   * page's one entry action; the hero never renders an entry link, in any
   * gating state.
   */
  it('never renders an entry CTA, regardless of gating state', () => {
    const heroProps = {
      monogramLetters: 'MKC',
      showName: 'Monogram Trial',
      showSubtitle: 'AKC Licensed Trial',
      trialStartDate: '2026-06-12',
      trialEndDate: '2026-06-14',
      entryLimit: null,
      venueName: 'Show Grounds',
      venueCity: 'Austin',
      timezone: 'America/Chicago',
      classesHref: null,
    };

    const { rerender } = render(<HeroBlock {...heroProps} entryCloseDate={null} />);
    expect(screen.queryByRole('link', { name: /enter/i })).not.toBeInTheDocument();

    rerender(<HeroBlock {...heroProps} entryCloseDate="2020-01-01" />);
    expect(screen.queryByRole('link', { name: /enter/i })).not.toBeInTheDocument();
  });

  describe('FinalCtaBand — mobile-only sticky repeat of the header CTA', () => {
    it('renders nothing at desktop width, even when entries are open', () => {
      mockViewport(false);
      render(
        <FinalCtaBand
          entryWizardUrl="/shows/show-1/register"
          entryCloseDate={null}
          timezone="America/Chicago"
        />
      );

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
    });

    it('renders one sticky "Enter this show" link at mobile width when entries are open', () => {
      mockViewport(true);
      render(
        <FinalCtaBand
          entryWizardUrl="/shows/show-1/register"
          entryCloseDate={null}
          timezone="America/Chicago"
        />
      );

      const link = screen.getByRole('link', { name: /enter this show/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/shows/show-1/register');
    });

    it('renders nothing at mobile width when classes are not ready', () => {
      mockViewport(true);
      render(
        <FinalCtaBand
          entryWizardUrl="/shows/show-1/register"
          entryCloseDate={null}
          timezone="America/Chicago"
          canEnterOnline={false}
        />
      );

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
    });

    it('renders nothing at mobile width when entries are closed', () => {
      mockViewport(true);
      render(
        <FinalCtaBand
          entryWizardUrl="/shows/show-1/register"
          entryCloseDate="2020-01-01"
          timezone="America/Chicago"
        />
      );

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
    });
  });
});
