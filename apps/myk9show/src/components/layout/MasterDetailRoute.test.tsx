import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { PawPrint } from 'lucide-react';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MasterDetailRoute } from './MasterDetailRoute';
import { DetailStateHeader } from './DetailStateHeader';

const viewport = vi.hoisted(() => ({ wide: true }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => viewport.wide }));

function List({ detail }: { detail?: React.ReactNode }) {
  return <div data-testid="list">{detail}</div>;
}

// A record that is not ready yet: all it shows is the shared not-ready header.
function NotReadyDetail() {
  return <DetailStateHeader />;
}

function renderRoute(path: string) {
  return render(
    <Routes>
      {['/dogs', '/dogs/:id'].map(routePath => (
        <Route
          key={routePath}
          path={routePath}
          element={
            <MasterDetailRoute
              List={List}
              Detail={NotReadyDetail}
              EmptyIcon={PawPrint}
              emptyText="Select a dog to see its details"
              crumb={{ label: 'Dogs', href: '/dogs' }}
            />
          }
        />
      ))}
    </Routes>,
    { initialRoute: path }
  );
}

// MYK9-1267: the route hands its crumb to the record, so a record that is still loading or failed
// keeps the page's one h1 and the Home > Dogs trail. Removing the provider fails both cases.
describe('MasterDetailRoute gives a not-ready record the list crumb', () => {
  it.each([
    ['wide (split)', true],
    ['narrow (record replaces the list)', false],
  ])('%s', (_name, wide) => {
    viewport.wide = wide;
    renderRoute('/dogs/dog-1');
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByText('Dogs')).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
