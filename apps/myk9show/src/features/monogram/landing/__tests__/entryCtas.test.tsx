import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { StickyNav } from '../sections/StickyNav';
import { HeroBlock } from '../sections/HeroBlock';
import { FinalCtaBand } from '../sections/FinalCtaBand';
import { useActionBarStore, selectReservedBottom } from '@/store/actionBarStore';

const reservedBottom = () => selectReservedBottom(useActionBarStore.getState());

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

/** jsdom reports 0 for every box, so stub the measurement — same pattern as
 * useRegisterActionBar.test.tsx. */
function stubHeight(px: number) {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ height: px, width: 375, top: 0, left: 0, right: 375, bottom: px, x: 0, y: 0 }),
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

  describe('HeroBlock — no CTA, but the "why not" copy stays (round-2 review)', () => {
    /**
     * MYK9-565: the hero used to render its own "Enter this show" / "Enter
     * your dog" CTA — the middle of the three a human tester counted (top /
     * middle / bottom, inconsistent copy). The sticky nav's CTA is now the
     * page's one entry action; the hero never renders an entry LINK, in any
     * gating state. Round-1 review flagged that the deletion took the
     * explanatory prose with it — the issue asked to remove duplicate CTAs,
     * not the guidance the other 7 styles keep. That prose is restored below.
     */
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

    it('never renders an entry CTA link, regardless of gating state', () => {
      const { rerender } = render(<HeroBlock {...heroProps} entryCloseDate={null} />);
      expect(screen.queryByRole('link', { name: /enter/i })).not.toBeInTheDocument();

      rerender(<HeroBlock {...heroProps} entryCloseDate="2020-01-01" />);
      expect(screen.queryByRole('link', { name: /enter/i })).not.toBeInTheDocument();
    });

    it('explains that classes are not assigned yet when canEnterOnline is false', () => {
      render(<HeroBlock {...heroProps} entryCloseDate={null} canEnterOnline={false} />);
      expect(screen.getByText(/no classes are assigned yet/i)).toBeInTheDocument();
    });

    it('explains that entries are closed when the close date has passed', () => {
      render(<HeroBlock {...heroProps} entryCloseDate="2020-01-01" />);
      expect(screen.getByText(/late-entry help/i)).toBeInTheDocument();
    });

    it('shows neither explanation while entries are open', () => {
      render(<HeroBlock {...heroProps} entryCloseDate="2099-01-01" />);
      expect(screen.queryByText(/no classes are assigned yet/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/late-entry help/i)).not.toBeInTheDocument();
    });
  });

  /**
   * Restored per round-1 review: this behavior (HeroBlock.tsx ~85, ~197) is
   * untouched by MYK9-565 and was left with no coverage once these were
   * deleted.
   */
  describe('"Closes {date}" gating (ux-date-status-consistency)', () => {
    const heroBaseProps = {
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

    it('HeroBlock shows "Closed" instead of a stale close date once entryCloseDate is in the past', () => {
      render(<HeroBlock {...heroBaseProps} entryCloseDate="2020-01-01" />);
      expect(screen.getByText('Closed')).toBeInTheDocument();
      expect(screen.queryByText(/Jan 1/)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
    });

    it('HeroBlock shows the close date when entryCloseDate is still in the future', () => {
      render(<HeroBlock {...heroBaseProps} entryCloseDate="2099-01-01" />);
      expect(screen.queryByText('Closed')).not.toBeInTheDocument();
      expect(screen.queryByText('TBA')).not.toBeInTheDocument();
    });

    it('HeroBlock shows "TBA" when no entryCloseDate is set at all', () => {
      render(<HeroBlock {...heroBaseProps} entryCloseDate={null} />);
      expect(screen.getByText('TBA')).toBeInTheDocument();
    });
  });

  describe('FinalCtaBand — mobile-only sticky repeat of the header CTA', () => {
    beforeEach(() => {
      useActionBarStore.setState({ heights: {} });
    });

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

    /**
     * Round-1 review, geometry finding: measured in real Chrome at 375x812,
     * the fixed bar (65px tall) permanently covered the footer's last block —
     * `elementFromPoint` on the footer's coordinates returned the bar.
     *
     * jsdom has no layout engine, so it cannot reproduce that pixel
     * measurement directly; what it CAN prove is the mechanism that makes the
     * fix hold in a real browser: the in-flow spacer this component renders
     * immediately before the fixed bar is sized to the bar's OWN measured
     * height (via `useRegisterActionBar`'s `onHeightChange`, the same
     * mechanism `ClassBulkActionsBar`/`DogsBulkActionsBar` use). As long as
     * spacer height === bar height, whatever sits right before the spacer in
     * the document (the footer's last block) is pushed up by exactly the
     * bar's height, clearing it at the end of the page.
     */
    it("reserves an in-flow spacer equal to the bar's own measured height", () => {
      stubHeight(65);
      mockViewport(true);
      const { container } = render(
        <>
          <footer>
            <div data-testid="footer-last-block">A member club of the American Kennel Club.</div>
          </footer>
          <FinalCtaBand
            entryWizardUrl="/shows/show-1/register"
            entryCloseDate={null}
            timezone="America/Chicago"
          />
        </>
      );

      const bar = screen.getByRole('region', { name: /enter this show/i });
      const spacer = bar.previousElementSibling as HTMLElement;
      expect(spacer).not.toBeNull();
      expect(spacer).toHaveAttribute('aria-hidden', 'true');
      expect(spacer.style.height).toBe('65px');

      // The footer sits before the spacer in document order; with the spacer
      // reserving the bar's own height, the footer's last block is not
      // beneath the fixed bar once scrolled to the end of the page.
      const footerLast = container.querySelector('[data-testid="footer-last-block"]');
      expect(footerLast).not.toBeNull();
      expect(footerLast?.compareDocumentPosition(spacer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('publishes its measured height to the shared action-bar registry while mounted', () => {
      stubHeight(65);
      mockViewport(true);
      expect(reservedBottom()).toBe(0);

      const { unmount } = render(
        <FinalCtaBand
          entryWizardUrl="/shows/show-1/register"
          entryCloseDate={null}
          timezone="America/Chicago"
        />
      );

      // Same registry AppToaster's `selectReservedBottom` reads (actionBarStore.ts)
      // — a bottom-docked toast must not cover this bar's CTA (2026-07-24 incident).
      expect(reservedBottom()).toBe(65);

      unmount();
      expect(reservedBottom()).toBe(0);
    });

    it('does not reserve action-bar space when not mounted (desktop width)', () => {
      stubHeight(65);
      mockViewport(false);
      render(
        <FinalCtaBand
          entryWizardUrl="/shows/show-1/register"
          entryCloseDate={null}
          timezone="America/Chicago"
        />
      );

      expect(reservedBottom()).toBe(0);
    });
  });
});
