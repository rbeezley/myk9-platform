import { screen } from '@testing-library/react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import AppEntryRedirect from './AppEntryRedirect';
import { getDashboardRoute } from '@/hooks/roleUtils';
import { UserRole } from '@/types/auth-types';
import { router } from '@/router';

type MockAuth = {
  user: { id: string; is_anonymous?: boolean } | null;
  loading: boolean;
  rbacLoading: boolean;
  userWithRoles: { roles: UserRole[] } | null;
};

let mockAuth: MockAuth;

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuth,
}));

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>;
}

function renderEntry() {
  return render(
    <Routes>
      <Route path="/app" element={<AppEntryRedirect />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    { initialRoute: '/app' }
  );
}

describe('AppEntryRedirect', () => {
  it('shows the loading fallback while auth resolves, never a redirect', () => {
    mockAuth = { user: null, loading: true, rbacLoading: false, userWithRoles: null };
    renderEntry();
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
  });

  it('keeps the loading fallback while roles resolve for a signed-in user', () => {
    mockAuth = { user: { id: 'u1' }, loading: false, rbacLoading: true, userWithRoles: null };
    renderEntry();
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor to sign-in, returning to /app', async () => {
    mockAuth = { user: null, loading: false, rbacLoading: false, userWithRoles: null };
    renderEntry();
    expect(await screen.findByTestId('where')).toHaveTextContent('/sign-in?redirectTo=%2Fapp');
  });

  it('sends a signed-in account to the same role home the app uses', async () => {
    mockAuth = {
      user: { id: 'u1' },
      loading: false,
      rbacLoading: false,
      userWithRoles: { roles: [UserRole.SECRETARY] },
    };
    renderEntry();
    expect(await screen.findByTestId('where')).toHaveTextContent(
      getDashboardRoute([UserRole.SECRETARY])
    );
    expect(getDashboardRoute([UserRole.SECRETARY])).toBe('/secretary/dashboard');
  });

  it('does not treat an anonymous ringside session as signed in', async () => {
    mockAuth = {
      user: { id: 'anon', is_anonymous: true },
      loading: false,
      rbacLoading: false,
      userWithRoles: { roles: [] },
    };
    renderEntry();
    expect(await screen.findByTestId('where')).toHaveTextContent('/sign-in?redirectTo=%2Fapp');
  });

  it('is registered in the app router', () => {
    const paths = router.routes.flatMap(function collect(r): string[] {
      return [...(r.path ? [r.path] : []), ...(r.children ?? []).flatMap(collect)];
    });
    expect(paths).toContain('/app');
  });
});
