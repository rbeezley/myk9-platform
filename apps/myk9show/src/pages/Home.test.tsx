import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import Home from './Home';
import { BANNED_COPY } from '@/components/landing/lifecycle/lifecycleStories';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
const fee = vi.hoisted(() => ({
  rates: { percent: 7, flatCents: 0, minCents: 0 } as {
    percent: number;
    flatCents: number;
    minCents: number;
  } | null,
}));
vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRatesQuery: () => ({ rates: fee.rates, state: fee.rates ? 'ready' : 'loading' }),
}));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: auth.user }) }));
vi.mock('@/features/show-today/ShowTodayBanner', () => ({
  ShowTodayBanner: () => <div data-testid="show-today-banner" />,
}));
vi.mock('@/components/landing/lifecycle/ClubOnboarding', () => ({
  ClubOnboarding: () => <section id="get-started" aria-label="Add your club form" />,
}));
vi.mock('@/components/landing/lifecycle/useTimelineProgress', () => ({
  useTimelineProgress: () => ({ isRevealed: () => true }),
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
    auth.user = null;
    fee.rates = { percent: 7, flatCents: 0, minCents: 0 };
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

  // A signed-in visitor (the club-onboarding return) already has an account: no sign-up
  // offer anywhere, even after switching the story to exhibitors.
  it('never offers a signed-in visitor a new account', () => {
    auth.user = { id: 'signed-in' };
    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    expect(screen.queryByRole('link', { name: /create (a free )?account/i })).toBeNull();
    expect(screen.getByRole('banner').querySelector('.l-btn-primary')?.textContent).toBe(
      'Add your club'
    );
    const close = screen.getByRole('region', { name: /ready when your next show is/i });
    expect(within(close).getByRole('link', { name: 'Add your club' })).toHaveClass('l-btn-primary');
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

  it('orders the page: trust bar, timeline, pricing, FAQ, then the close', () => {
    render(<Home />);
    const ids = ['trust-title', 'lc-title', 'pricing-title', 'faq-title', 'close-title'];
    const nodes = ids.map(id => document.getElementById(id));
    for (const [i, node] of nodes.entries()) expect(node, ids[i]).not.toBeNull();
    for (let i = 1; i < nodes.length; i += 1) {
      const follows =
        nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING;
      expect(follows, `${ids[i]} after ${ids[i - 1]}`).toBeTruthy();
    }
  });

  it('states the service fee that is charged, read live, in pricing and in the FAQ', () => {
    fee.rates = { percent: 9, flatCents: 0, minCents: 0 };
    render(<Home />);
    const pricing = screen.getByRole('region', { name: 'What it costs' });
    expect(pricing).toHaveTextContent('Exhibitors pay a 9% service fee when they enter online.');
    expect(within(pricing).getByText('9% service fee')).toBeInTheDocument();
    expect(within(pricing).getByText('Free')).toBeInTheDocument();
    const faq = screen.getByRole('region', { name: 'Questions clubs ask' });
    expect(faq).toHaveTextContent('Exhibitors pay a 9% service fee when they pay by card.');
    expect(document.body.textContent).not.toMatch(/7%/);
  });

  it('prints no fee figure until the live rate has been read', () => {
    fee.rates = null;
    render(<Home />);
    const pricing = screen.getByRole('region', { name: 'What it costs' });
    expect(pricing).toHaveTextContent('Exhibitors pay a service fee when they enter online.');
    expect(within(pricing).getByText('A service fee')).toBeInTheDocument();
    expect(pricing.textContent).not.toMatch(/\d\s*%/);
    expect(screen.getByRole('region', { name: 'Questions clubs ask' }).textContent).not.toMatch(
      /\d\s*%/
    );
  });

  it('links pricing to the one fee explanation and answers six questions', () => {
    render(<Home />);
    const pricing = screen.getByRole('region', { name: 'What it costs' });
    expect(within(pricing).getByRole('link', { name: 'How our fees work' })).toHaveAttribute(
      'href',
      '/fees'
    );
    const faq = screen.getByRole('region', { name: 'Questions clubs ask' });
    expect(faq.querySelectorAll('details > summary')).toHaveLength(6);
  });

  it('keeps the trust bar under the hero with its four facts and the about anchor', () => {
    render(<Home />);
    const trust = screen.getByRole('region', { name: /built by the team behind/i });
    expect(trust).toHaveAttribute('id', 'about');
    expect(within(trust).getAllByRole('listitem')).toHaveLength(4);
    expect(trust).toHaveTextContent('More than 200 clubs run their trials on mySWT and myNWT.');
  });

  it('still scrolls /#get-started to the club form', () => {
    window.history.replaceState({}, '', '/#get-started');
    render(<Home />);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  // The banner lists a signed-in account's entries for today, so a guest's page never loads it.
  it('loads the show-today banner for a signed-in visitor only', async () => {
    const guest = render(<Home />);
    expect(screen.queryByTestId('show-today-banner')).toBeNull();
    guest.unmount();

    auth.user = { id: 'signed-in' };
    render(<Home />);
    expect(await screen.findByTestId('show-today-banner')).toBeInTheDocument();
  });

  it('ignores retired anchors without error', () => {
    window.history.replaceState({}, '', '/#closing');
    expect(() => render(<Home />)).not.toThrow();
  });
});
