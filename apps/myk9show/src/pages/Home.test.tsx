import { forwardRef, type ComponentProps } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import Home from './Home';

vi.mock('@/components/landing/v2', () => ({
  LandingHeader: () => null,
  HeroPhotoLed: () => null,
  TaglineStrip: () => null,
  CredibilityBand: () => null,
  ClubFeatures: () => null,
  ExhibitorFeatures: () => null,
  OfflineCallout: () => null,
  ClubOnboarding: () => <section id="get-started" />,
  ClosingWaitlist: forwardRef<HTMLElement, ComponentProps<'section'>>((_, ref) => (
    <section ref={ref} id="closing" />
  )),
  LandingFooter: () => null,
}));

vi.mock('@/features/show-today/ShowTodayBanner', () => ({
  ShowTodayBanner: () => null,
}));

describe('Home', () => {
  const originalHash = window.location.hash;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    window.history.replaceState({}, '', '/#get-started');
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    window.history.replaceState({}, '', `/${originalHash}`);
  });

  it('scrolls to the club onboarding form when the return hash is present', () => {
    render(<Home />, { initialRoute: '/#get-started' });

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });
});
