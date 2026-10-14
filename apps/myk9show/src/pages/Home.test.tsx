import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import Home from './Home';
import { BANNED_COPY } from '@/components/landing/lifecycle/lifecycleStories';

vi.mock('@/features/show-today/ShowTodayBanner', () => ({ ShowTodayBanner: () => null }));
vi.mock('@/components/landing/lifecycle/ClubOnboarding', () => ({
  ClubOnboarding: () => <section id="get-started" aria-label="Add your club form" />,
}));
vi.mock('@/components/landing/lifecycle/useTimelineProgress', () => ({
  useTimelineProgress: () => ({ reached: 0, isRevealed: () => true }),
}));

const linkTexts = (root: Element) =>
  Array.from(root.querySelectorAll('a')).map(a => a.textContent?.trim());

describe('Home', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0);
      return 1;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    window.history.replaceState({}, '', '/');
  });

  it('leads the hero with Add your club, then Find a show, then the exhibitor account link', () => {
    render(<Home />);
    const hero = screen.getByRole('region', { name: /from premium list/i });
    expect(linkTexts(hero)).toEqual(['Add your club', 'Find a show', 'Create a free account']);
    expect(hero.querySelector('a[href="#get-started"]')).toHaveClass('l-btn-primary');
    expect(hero.querySelector('a[href="/shows"]')).not.toHaveClass('l-btn-primary');
    const signUp = within(hero).getByRole('link', { name: 'Create a free account' });
    expect(signUp).toHaveAttribute('href', '/sign-up');
    expect(signUp).not.toHaveClass('l-btn-primary');
  });

  it('makes Add your club the primary button in the header', () => {
    render(<Home />);
    const header = screen.getByRole('banner');
    expect(header.querySelector('.l-btn-primary')?.textContent).toBe('Add your club');
  });

  it('leads the header and close with a free account once the story is for exhibitors', () => {
    render(<Home />);
    const header = screen.getByRole('banner');
    const close = screen.getByRole('region', { name: /ready when your next show is/i });
    expect(within(close).getByRole('link', { name: 'Add your club' })).toHaveClass('l-btn-primary');

    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    const primary = header.querySelector('.l-btn-primary')!;
    expect(primary.textContent).toBe('Create account');
    expect(primary).toHaveAttribute('href', '/sign-up');
    const exhibitorClose = screen.getByRole('region', { name: /ready for your next trial/i });
    expect(within(exhibitorClose).getByRole('link', { name: 'Create a free account' })).toHaveClass(
      'l-btn-primary'
    );
    expect(within(exhibitorClose).queryByRole('link', { name: 'Add your club' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'I’m running a show' }));
    expect(header.querySelector('.l-btn-primary')?.textContent).toBe('Add your club');
  });

  it('keeps the hero lede to 20 words or fewer', () => {
    render(<Home />);
    const lede =
      screen
        .getByRole('region', { name: /from premium list/i })
        .querySelector('.l-lede')
        ?.textContent?.trim() ?? '';
    expect(lede.split(/\s+/).length).toBeLessThanOrEqual(20);
  });

  it('uses one label per intent across the whole page', () => {
    render(<Home />);
    const labels = screen.getAllByRole('link').map(a => a.textContent?.trim());
    for (const banned of ['Browse shows', 'Join the waitlist', 'Run your next trial'])
      expect(labels).not.toContain(banned);
  });

  it('renders no banned copy anywhere on the page', () => {
    const { container } = render(<Home />);
    for (const re of BANNED_COPY) expect(container.textContent ?? '').not.toMatch(re);
  });

  it('still scrolls /#get-started to the club form', () => {
    window.history.replaceState({}, '', '/#get-started');
    render(<Home />);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('ignores retired anchors without error', () => {
    window.history.replaceState({}, '', '/#closing');
    expect(() => render(<Home />)).not.toThrow();
  });
});
