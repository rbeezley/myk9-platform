import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { UserRole } from '@/types/auth-types';
import { BrowseTabs } from '../BrowseTabs';
import { EmbeddedDetailProvider } from '../embeddedDetail';

const auth = {
  user: { id: 'auth-1', is_anonymous: false } as { id: string; is_anonymous: boolean } | null,
  userWithRoles: { roles: [UserRole.SECRETARY] as UserRole[] } as { roles: UserRole[] } | null,
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => auth,
}));

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

// Each list is its own route element, as in the app, so a switch remounts the tablist.
function ListPage({ name }: { name: string }) {
  return (
    <BrowseTabs>
      <h1>{name} list</h1>
    </BrowseTabs>
  );
}

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/shows/*" element={<ListPage name="Shows" />} />
        <Route path="/dogs/*" element={<ListPage name="Dogs" />} />
        <Route path="/people/*" element={<ListPage name="People" />} />
        <Route path="/clubs/*" element={<ListPage name="Clubs" />} />
        <Route path="/back" element={<p>Somewhere else</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

const tabNames = () => screen.getAllByRole('tab').map(tab => tab.textContent);
const location = () => screen.getByTestId('location').textContent;

describe('BrowseTabs', () => {
  beforeEach(() => {
    auth.user = { id: 'auth-1', is_anonymous: false };
    auth.userWithRoles = { roles: [UserRole.SECRETARY] };
  });

  it('renders a tablist above the list, the open list selected, and the list as its tabpanel', () => {
    renderAt('/dogs');

    const tablist = screen.getByRole('tablist', { name: 'Browse' });
    expect(tablist).toBeInTheDocument();
    expect(tabNames()).toEqual(['Shows', 'Dogs', 'People', 'Clubs']);
    const dogs = screen.getByRole('tab', { name: 'Dogs' });
    expect(dogs).toHaveAttribute('aria-selected', 'true');
    expect(dogs).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Shows' })).toHaveAttribute('tabindex', '-1');

    const panel = screen.getByRole('tabpanel', { name: 'Dogs' });
    expect(dogs).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveTextContent('Dogs list');
  });

  it("gives each tab its list's own URL", () => {
    renderAt('/shows');

    expect(screen.getByRole('tab', { name: 'Shows' })).toHaveAttribute('href', '/shows');
    expect(screen.getByRole('tab', { name: 'Dogs' })).toHaveAttribute('href', '/dogs');
    expect(screen.getByRole('tab', { name: 'People' })).toHaveAttribute('href', '/people');
    expect(screen.getByRole('tab', { name: 'Clubs' })).toHaveAttribute('href', '/clubs');
  });

  it('keeps the list selected on one of its records', () => {
    renderAt('/clubs/club-9');

    expect(screen.getByRole('tab', { name: 'Clubs' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches list on click', async () => {
    const user = userEvent.setup();
    renderAt('/shows');

    await user.click(screen.getByRole('tab', { name: 'People' }));

    expect(location()).toBe('/people');
    expect(screen.getByRole('heading', { name: 'People list' })).toBeInTheDocument();
  });

  it('moves with the arrow keys, Home and End; the URL follows and focus stays on the tab', async () => {
    const user = userEvent.setup();
    renderAt('/shows');

    screen.getByRole('tab', { name: 'Shows' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(location()).toBe('/dogs');
    expect(screen.getByRole('tab', { name: 'Dogs' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(location()).toBe('/clubs');
    expect(screen.getByRole('tab', { name: 'Clubs' })).toHaveFocus();

    // Wraps from the last tab to the first.
    await user.keyboard('{ArrowRight}');
    expect(location()).toBe('/shows');
    expect(screen.getByRole('tab', { name: 'Shows' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(location()).toBe('/clubs');

    await user.keyboard('{Home}');
    expect(location()).toBe('/shows');
    expect(screen.getByRole('tab', { name: 'Shows' })).toHaveFocus();
  });

  it('shows a judge only Shows and their own dogs', () => {
    auth.userWithRoles = { roles: [UserRole.JUDGE] };
    renderAt('/shows');

    expect(tabNames()).toEqual(['Shows', 'My Dogs']);
  });

  it('offers no switch on a list the role cannot browse', () => {
    auth.userWithRoles = { roles: [UserRole.JUDGE] };
    renderAt('/clubs');

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Clubs list' })).toBeInTheDocument();
  });

  it.each([
    ['an exhibitor-only account (phase 4)', [UserRole.EXHIBITOR]],
    ['a site admin with no other role', [UserRole.SITE_ADMIN]],
  ])('offers no switch to %s', (_label, roles) => {
    auth.userWithRoles = { roles };
    renderAt('/dogs');

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dogs list' })).toBeInTheDocument();
  });

  it('offers no switch to a signed-out visitor', () => {
    auth.user = null;
    auth.userWithRoles = null;
    renderAt('/clubs');

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('offers no switch inside a detail pane (Find Shows beside the Shows list)', () => {
    render(
      <MemoryRouter initialEntries={['/shows']}>
        <EmbeddedDetailProvider value>
          <BrowseTabs>
            <h1>Find Shows</h1>
          </BrowseTabs>
        </EmbeddedDetailProvider>
      </MemoryRouter>
    );

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Find Shows' })).toBeInTheDocument();
  });
});
