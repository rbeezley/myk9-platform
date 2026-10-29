import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { UserRole } from '@/types/auth-types';
import { RoleSidebar } from '../RoleSidebar';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';

vi.mock('@/components/layout/AccountMenuContent', () => ({
  AccountMenuContent: () => null,
}));

const LONG = 'Heartland Spring Nosework Trial';
const show = { id: 'show-1', name: LONG };
const second = { id: 'show-2', name: 'Fall Classic' };

function renderRail(
  route: string,
  nav: { currentShow: typeof show | null; managingShows: (typeof show)[] },
  onChooseShow = vi.fn(),
  variant: 'rail' | 'drawer' = 'rail'
) {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY], undefined, 'Jordan', {
    ...nav,
    onChooseShow,
  });
  return render(<RoleSidebar config={config} variant={variant} />, { initialRoute: route });
}

const showLink = () => screen.getByRole('link', { name: `Heartland Spring…: ${LONG}` });
const browseLink = () => screen.getByRole('link', { name: 'Browse' });

describe('current show rail item', () => {
  it('shows the truncated name, keeps the full name accessible and in the tooltip, and opens the Overview', () => {
    renderRail('/secretary/dashboard', { currentShow: show, managingShows: [show] });

    expect(showLink()).toHaveTextContent(/^Heartland Spring…$/);
    expect(showLink()).toHaveAttribute('title', LONG);
    expect(showLink()).toHaveAttribute('href', '/shows/show-1');
    expect(screen.queryByRole('button', { name: 'Switch' })).not.toBeInTheDocument();
  });

  it('sits directly under Home (MYK9-1490)', () => {
    renderRail('/secretary/dashboard', { currentShow: show, managingShows: [show] });

    const links = screen.getAllByRole('link');
    const home = screen.getByRole('link', { name: 'Home' });
    expect(links.indexOf(showLink())).toBe(links.indexOf(home) + 1);
  });

  it('uses a short name whole, with no tooltip or doubled accessible name', () => {
    renderRail('/secretary/dashboard', {
      currentShow: second,
      managingShows: [second],
    });

    const link = screen.getByRole('link', { name: 'Fall Classic' });
    expect(link).not.toHaveAttribute('title');
  });

  it.each(['/shows/show-1', '/shows/show-1/results'])(
    'is the current page on %s while Browse is not',
    route => {
      renderRail(route, { currentShow: show, managingShows: [show] });

      expect(showLink()).toHaveAttribute('aria-current', 'page');
      expect(showLink()).toHaveClass('bg-primary/10');
      expect(browseLink()).not.toHaveAttribute('aria-current');
    }
  );

  it('leaves Browse current on a show the viewer does not manage', () => {
    renderRail('/shows/other-show', { currentShow: show, managingShows: [show] });

    expect(browseLink()).toHaveAttribute('aria-current', 'page');
    expect(showLink()).not.toHaveAttribute('aria-current');
  });

  it('is absent when the viewer manages no show', () => {
    renderRail('/secretary/dashboard', { currentShow: null, managingShows: [] });

    expect(screen.queryByRole('link', { name: /Heartland/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch' })).not.toBeInTheDocument();
  });

  it('offers Switch with the other managed shows, and choosing one is remembered', async () => {
    const user = userEvent.setup();
    const onChooseShow = vi.fn();
    renderRail(
      '/secretary/dashboard',
      { currentShow: show, managingShows: [show, second] },
      onChooseShow
    );

    expect(showLink()).toHaveAttribute('href', '/shows/show-1');
    await user.click(screen.getByRole('button', { name: 'Switch show' }));
    expect(screen.queryByRole('link', { name: LONG })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Fall Classic' }));

    expect(onChooseShow).toHaveBeenCalledWith('show-2');
    expect(screen.queryByRole('link', { name: 'Fall Classic' })).not.toBeInTheDocument();
  });

  it('does not remember a plain click on the current show as a Switch choice', async () => {
    const user = userEvent.setup();
    const onChooseShow = vi.fn();
    renderRail(
      '/secretary/dashboard',
      { currentShow: show, managingShows: [show, second] },
      onChooseShow
    );

    await user.click(showLink());

    expect(onChooseShow).not.toHaveBeenCalled();
  });

  it('lists the current show under its own heading in the mobile drawer', () => {
    renderRail(
      '/shows/show-1',
      { currentShow: show, managingShows: [show, second] },
      vi.fn(),
      'drawer'
    );

    expect(screen.getByRole('heading', { name: 'Current show' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: LONG })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Fall Classic' })).toBeInTheDocument();
  });
});
