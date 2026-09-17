/**
 * MYK9-633 round 2.
 *
 * The doc comment on `StickyEntryCtaBar` claims three mechanics carried
 * over from Monogram's `FinalCtaBand` (MYK9-565): the in-flow spacer, the
 * action-bar registry write, and the safe-area padding. Several styles'
 * test suites say those mechanics are "covered by its own shared-component
 * tests" — this file is what makes that true. Each assertion below is
 * BEHAVIOUR (measured DOM/store state), not a grep for source text
 * (LESSONS `source-text-tests`): a comment claiming a mechanic exists is
 * not proof it runs.
 *
 * Each test was run against three single-line mutations of the component
 * (spacer removed, `useRegisterActionBar` call removed, safe-area
 * `calc(...)` replaced with a bare `10px`) to confirm it goes red for the
 * mechanic it claims to cover — see the mutation log in the PR description.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StickyEntryCtaBar } from '../StickyEntryCtaBar';
import { useActionBarStore } from '@/store/actionBarStore';

function mockViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function stubHeight(px: number) {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      height: px,
      width: 375,
      top: 0,
      left: 0,
      right: 375,
      bottom: px,
      x: 0,
      y: 0,
    }),
  });
}

const SURFACE = {
  background: '#111111',
  buttonBackground: '#ffffff',
  buttonColor: '#111111',
};

describe('StickyEntryCtaBar', () => {
  afterEach(() => {
    mockViewport(false);
    // Reset the shared action-bar registry between tests — it is a module
    // singleton and would otherwise leak a mounted height into the next
    // test's assertions.
    useActionBarStore.setState({ heights: {} });
  });

  it('sizes the in-flow spacer to the measured bar height', () => {
    stubHeight(65);
    mockViewport(true);
    render(
      <StickyEntryCtaBar
        entryWizardUrl="/shows/show-1/register"
        canShowEntryCta
        surface={SURFACE}
      />
    );

    const bar = screen.getByRole('region', { name: /enter this show/i });
    const spacer = bar.previousElementSibling as HTMLElement;

    expect(spacer).toHaveAttribute('aria-hidden', 'true');
    expect(spacer.style.height).toBe('65px');
  });

  it('removes the spacer (and the bar) when the component unmounts', () => {
    stubHeight(65);
    mockViewport(true);
    const { container, unmount } = render(
      <StickyEntryCtaBar
        entryWizardUrl="/shows/show-1/register"
        canShowEntryCta
        surface={SURFACE}
      />
    );

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();

    unmount();

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(container.querySelector('[role="region"]')).toBeNull();
  });

  it('writes the measured height into the shared action-bar registry while mounted, and withdraws it on unmount', () => {
    stubHeight(65);
    mockViewport(true);

    expect(Object.values(useActionBarStore.getState().heights)).toEqual([]);

    const { unmount } = render(
      <StickyEntryCtaBar
        entryWizardUrl="/shows/show-1/register"
        canShowEntryCta
        surface={SURFACE}
      />
    );

    // This is the registry AppToaster's `selectReservedBottom` reads so a
    // bottom-docked toast doesn't cover the bar's CTA (actionBarStore.ts).
    expect(Object.values(useActionBarStore.getState().heights)).toEqual([65]);

    unmount();

    expect(Object.values(useActionBarStore.getState().heights)).toEqual([]);
  });

  it('pads the bar for the home-indicator safe area on notched phones', () => {
    stubHeight(65);
    mockViewport(true);
    render(
      <StickyEntryCtaBar
        entryWizardUrl="/shows/show-1/register"
        canShowEntryCta
        surface={SURFACE}
      />
    );

    const bar = screen.getByRole('region', { name: /enter this show/i });
    // jsdom's CSSOM serializer reformats the env() fallback syntax
    // (e.g. "env(0px * , * safe-area-inset-bottom)"), so assert the two
    // substrings a browser and jsdom agree on rather than the exact
    // source text.
    expect(bar.style.paddingBottom).toContain('env(');
    expect(bar.style.paddingBottom).toContain('safe-area-inset-bottom');
  });

  it('keeps the link at or above the 44px touch-target floor', () => {
    stubHeight(65);
    mockViewport(true);
    render(
      <StickyEntryCtaBar
        entryWizardUrl="/shows/show-1/register"
        canShowEntryCta
        surface={SURFACE}
      />
    );

    const link = screen.getByRole('link', { name: /enter this show/i });
    expect(link.style.minHeight).toBe('44px');
  });

  it('renders nothing at desktop width even when the entry action is available', () => {
    stubHeight(65);
    mockViewport(false);
    render(
      <StickyEntryCtaBar
        entryWizardUrl="/shows/show-1/register"
        canShowEntryCta
        surface={SURFACE}
      />
    );

    expect(screen.queryByRole('region', { name: /enter this show/i })).not.toBeInTheDocument();
  });

  it('renders nothing at mobile width when the entry action is unavailable', () => {
    stubHeight(65);
    mockViewport(true);
    render(
      <StickyEntryCtaBar
        entryWizardUrl="/shows/show-1/register"
        canShowEntryCta={false}
        surface={SURFACE}
      />
    );

    expect(screen.queryByRole('region', { name: /enter this show/i })).not.toBeInTheDocument();
  });

  describe('accessible name (MYK9-633 round 2)', () => {
    it('strips a trailing arrow from the visible label into an aria-hidden span', () => {
      stubHeight(65);
      mockViewport(true);
      render(
        <StickyEntryCtaBar
          entryWizardUrl="/shows/show-1/register"
          canShowEntryCta
          surface={SURFACE}
          label="ENTER →"
        />
      );

      const link = screen.getByRole('link', { name: 'ENTER' });
      expect(link).toHaveAttribute('href', '/shows/show-1/register');
      expect(link.textContent).toBe('ENTER →');
      const arrowSpan = link.querySelector('span[aria-hidden="true"]');
      expect(arrowSpan?.textContent?.trim()).toBe('→');
    });

    it('uses an explicit ariaLabel override when the visible label does not match the header CTA', () => {
      stubHeight(65);
      mockViewport(true);
      render(
        <StickyEntryCtaBar
          entryWizardUrl="/shows/show-1/register"
          canShowEntryCta
          surface={SURFACE}
          label="ENTER →"
          ariaLabel="Enter show"
        />
      );

      expect(screen.getByRole('link', { name: 'Enter show' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'ENTER' })).not.toBeInTheDocument();
    });
  });
});
