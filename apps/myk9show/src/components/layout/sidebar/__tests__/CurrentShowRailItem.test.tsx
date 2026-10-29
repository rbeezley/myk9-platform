import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
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
  currentShow: typeof show | null,
  variant: 'rail' | 'drawer' = 'rail'
) {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY], undefined, 'Jordan', {
    currentShow,
  });
  return render(<RoleSidebar config={config} variant={variant} />, { initialRoute: route });
}

const showLink = () => screen.getByRole('link', { name: `Heartland Spring…: ${LONG}` });
const browseLink = () => screen.getByRole('link', { name: 'Browse' });

describe('current show rail item', () => {
  it('shows the truncated name, keeps the full name accessible and in the tooltip, and opens the Overview', () => {
    renderRail('/secretary/dashboard', show);

    expect(showLink()).toHaveTextContent(/^Heartland Spring…$/);
    expect(showLink()).toHaveAttribute('title', LONG);
    expect(showLink()).toHaveAttribute('href', '/shows/show-1');
    expect(screen.queryByRole('button', { name: 'Switch' })).not.toBeInTheDocument();
  });

  it('sits directly under Home (MYK9-1490)', () => {
    renderRail('/secretary/dashboard', show);

    const links = screen.getAllByRole('link');
    const home = screen.getByRole('link', { name: 'Home' });
    expect(links.indexOf(showLink())).toBe(links.indexOf(home) + 1);
  });

  it('uses a short name whole, with no tooltip or doubled accessible name', () => {
    renderRail('/secretary/dashboard', second);

    const link = screen.getByRole('link', { name: 'Fall Classic' });
    expect(link).not.toHaveAttribute('title');
  });

  it.each(['/shows/show-1', '/shows/show-1/results'])(
    'is the current page on %s while Browse is not',
    route => {
      renderRail(route, show);

      expect(showLink()).toHaveAttribute('aria-current', 'page');
      expect(showLink()).toHaveClass('bg-primary/10');
      expect(browseLink()).not.toHaveAttribute('aria-current');
    }
  );

  it('leaves Browse current on a show the viewer does not manage', () => {
    renderRail('/shows/other-show', show);

    expect(browseLink()).toHaveAttribute('aria-current', 'page');
    expect(showLink()).not.toHaveAttribute('aria-current');
  });

  it('is absent when the viewer manages no show', () => {
    renderRail('/secretary/dashboard', null);

    expect(screen.queryByRole('link', { name: /Heartland/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch' })).not.toBeInTheDocument();
  });

  it('lists only the current show under its own heading in the mobile drawer', () => {
    renderRail('/shows/show-1', show, 'drawer');

    expect(screen.getByRole('heading', { name: 'Current show' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: LONG })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Fall Classic' })).not.toBeInTheDocument();
  });

  // MYK9-1490: the pin on a Home show card is the only override; the rail has no Switch.
  it('has no Switch control', () => {
    renderRail('/secretary/dashboard', show);

    expect(screen.queryByRole('button', { name: /switch/i })).not.toBeInTheDocument();
  });
});
