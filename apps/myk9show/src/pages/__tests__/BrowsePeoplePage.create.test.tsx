/**
 * MYK9-1273: Add Person saves, then must open the new person's record. EditPanelWrapper calls
 * the page's onClose again after onSave resolves; that call used to rewrite the URL back to the
 * list, overwriting the navigation to /people/<id>.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { waitFor } from '@testing-library/react';
import { screen, render } from '@/test/utils/testUtils';
import { useLocation } from 'react-router-dom';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import BrowsePeoplePage from '../BrowsePeoplePage';

const createdPerson = {
  id: 'new-1',
  firstName: 'Pat',
  lastName: 'Lee',
  email: 'p@l.co',
  roles: [] as string[],
};
const addUser = vi.fn();

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({ hasPermission: () => true, hasRole: () => true, isLoading: false }),
}));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  fetchPersonEmailLockFacts: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/hooks/useBrowsePeopleData', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useBrowsePeopleData')>()),
  useBrowsePeopleData: () => ({
    people: [],
    filteredPeople: [],
    isLoading: false,
    error: null,
    filters: { search: 'jo', role: 'all', location: 'all', login: 'all' },
    setFilters: vi.fn(),
    hasActiveFilters: true,
    clearAllFilters: vi.fn(),
  }),
}));
vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({ addUser }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname + location.search}</div>;
}

const renderPage = () =>
  render(
    <>
      <BrowsePeoplePage />
      <LocationProbe />
    </>,
    { initialRoute: '/people?add=true&q=jo' }
  );

describe('BrowsePeoplePage Add Person', () => {
  beforeEach(() => {
    localStorage.clear();
    mockViewportWidth(1600);
    addUser.mockReset();
    addUser.mockResolvedValue(createdPerson);
  });

  it('opens the new person record after Save', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText(/First Name/), 'P');
    await user.type(screen.getByLabelText(/Last Name/), 'L');
    await user.type(screen.getByLabelText(/Email/), 'p@l.co');
    await user.click(screen.getByRole('tab', { name: /^Contact/ }));
    await user.click(await screen.findByRole('button', { name: /^(save|create|add)/i }));
    await waitFor(() => expect(addUser).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/people/new-1'));
    await new Promise(r => setTimeout(r, 50));
    expect(screen.getByTestId('loc').textContent).toBe('/people/new-1');
  });

  it('Cancel strips only add and keeps the other filters', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText(/First Name/);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/people?q=jo'));
    expect(addUser).not.toHaveBeenCalled();
  });
});
