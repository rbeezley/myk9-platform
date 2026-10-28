import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import { DEFAULT_PEOPLE_FILTERS } from '@/hooks/useBrowsePeopleData';
import { parseUrlFilters } from '@/hooks/urlFilters';

const makePerson = (id: string, firstName: string) => ({
  id,
  firstName,
  lastName: 'Handler',
  email: `${firstName.toLowerCase()}@example.com`,
  roles: ['exhibitor'],
});

const people = [makePerson('p1', 'Ada'), makePerson('p2', 'Adam')];
const data = { people, filteredPeople: people, isLoading: false, error: null as Error | null };
const detailMounts = { count: 0 };

// Filters live in the URL, as in the real hook (useUrlFilters).
vi.mock('@/hooks/useBrowsePeopleData', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useBrowsePeopleData')>()),
  useBrowsePeopleData: () => ({
    ...data,
    filters: parseUrlFilters(useSearchParams()[0], DEFAULT_PEOPLE_FILTERS),
    setFilters: vi.fn(),
    hasActiveFilters: false,
    clearAllFilters: vi.fn(),
    handleRetry: vi.fn(),
  }),
}));
vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({ hasPermission: () => true, isLoading: false }),
}));
vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ addUser: vi.fn() }) }));
vi.mock('@/components/panels/edit', () => ({ UserEditPanel: () => null }));

const layoutSeen = vi.hoisted(() => ({
  props: null as { id: string; listSize?: unknown } | null,
}));
vi.mock('@/components/layout/MasterDetailLayout', async importOriginal => {
  const actual =
    (await importOriginal()) as typeof import('@/components/layout/MasterDetailLayout');
  return {
    ...actual,
    MasterDetailLayout: (props: React.ComponentProps<typeof actual.MasterDetailLayout>) => {
      layoutSeen.props = props;
      return <actual.MasterDetailLayout {...props} />;
    },
  };
});

import BrowsePeoplePage from '../BrowsePeoplePage';

// Counts mounts, so a test can tell "still showing" from "unmounted and shown again".
function OpenPerson() {
  useEffect(() => {
    detailMounts.count += 1;
  }, []);
  return <p>the open person</p>;
}

function Probe() {
  const location = useLocation();
  return <p data-testid="loc">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(route: string) {
  const tree = () => (
    <>
      <Routes>
        <Route path="/people/:id?" element={<BrowsePeoplePage detail={<OpenPerson />} />} />
      </Routes>
      <Probe />
    </>
  );
  const result = render(tree(), { initialRoute: route });
  return { ...result, refresh: () => result.rerender(tree()) };
}

const FILTERED = '/people/p1?search=ad&role=exhibitor&returnTo=%2Fshows&add=false';
const KEPT = '?search=ad&role=exhibitor';

describe('People list beside an open person', () => {
  beforeEach(() => {
    localStorage.clear();
    data.people = people;
    data.filteredPeople = people;
    data.isLoading = false;
    data.error = null;
    detailMounts.count = 0;
    mockViewportWidth(1600);
  });

  it('gives the list the narrow People bounds under a fresh storage id', () => {
    renderAt('/people/p1');
    expect(layoutSeen.props).toMatchObject({
      id: 'people-v2',
      listSize: { default: '28%', min: '22%', max: '40%' },
    });
  });

  it('keeps the filters, and only the filters, on a row opened with the mouse', async () => {
    renderAt(FILTERED);
    const row = screen.getByRole('link', { name: /Adam/ });
    expect(row).toHaveAttribute('href', `/people/p2${KEPT}`);

    await userEvent.click(row);
    expect(screen.getByTestId('loc')).toHaveTextContent(`/people/p2${KEPT}`);
  });

  it('keeps the filters, and only the filters, on Up/Down', async () => {
    renderAt(FILTERED);
    screen.getByRole('link', { name: /Ada Handler/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('loc')).toHaveTextContent(`/people/p2${KEPT}`);
  });

  it('keeps the open person mounted while an empty list loads, fails and retries', () => {
    data.people = [];
    data.filteredPeople = [];
    data.isLoading = true;
    const { refresh } = renderAt('/people/p1');
    expect(screen.getByText('the open person')).toBeInTheDocument();

    data.isLoading = false;
    data.error = new Error('offline');
    refresh();
    expect(screen.getByText("We couldn't load people.")).toBeInTheDocument();
    expect(screen.getByText('the open person')).toBeInTheDocument();

    data.error = null;
    data.isLoading = true;
    refresh();
    expect(screen.getByText('the open person')).toBeInTheDocument();
    expect(detailMounts.count).toBe(1);
  });
});
