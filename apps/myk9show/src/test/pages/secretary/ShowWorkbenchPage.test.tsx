import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, ProtectedRoute } from '@/context/AuthContext';
import ShowWorkbenchPage from '@/pages/secretary/ShowWorkbenchPage';
import { UserRole } from '@/types/auth-types';

const navigateMock = vi.hoisted(() => vi.fn());
const refetchMock = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());

let mockShow: Record<string, unknown> | null = {
  id: 'show-1',
  name: 'Bluegrass Classic',
  organization: 'AKC',
  startDate: '2026-03-22',
  endDate: '2026-03-23',
  location: 'Louisville, KY',
  clubName: 'Bluegrass KC',
  status: 'accepting_entries',
  events: [],
  source: 'myK9Show',
  entryOpenDate: '2026-01-01',
  entryCloseDate: '2027-12-31',
  preEntryFee: '$30',
  clubId: 'club-1',
  clubAddress: '',
  clubEmail: '',
  logoUrl: '',
  coverImageUrl: '',
  accentColor: '',
  assignedJudges: [],
  stats: [],
  trials: [],
};
let mockLoading = false;
let mockError = false;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getUserRoles: vi.fn().mockResolvedValue([]),
    getUserRolesByEmail: vi.fn().mockResolvedValue([]),
    hasPermission: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: (showId?: string) => ({
    showId: showId ?? null,
    show: mockLoading ? null : mockShow,
    isLoading: mockLoading,
    isError: mockError,
    refetch: refetchMock,
    isFromCache: false,
    loadTime: 0,
    hasData: !!mockShow,
  }),
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-shell">{children}</div>
  ),
}));

vi.mock('@/components/common/PageHeader', () => ({
  PageHeader: ({
    breadcrumbs,
    title,
    actions,
  }: {
    breadcrumbs: Array<{ label: string }>;
    title: string;
    actions?: React.ReactNode;
  }) => (
    <header data-testid="page-header">
      <h1>{title}</h1>
      <span>{breadcrumbs.map(crumb => crumb.label).join(' / ')}</span>
      {actions}
    </header>
  ),
}));

vi.mock('@/components/common/DetailHero', () => ({
  DetailHero: ({
    name,
    subtitle,
    badges,
    footer,
    secondaryActions,
  }: {
    name: string;
    subtitle?: string;
    badges?: Array<{ label: string }>;
    footer?: React.ReactNode;
    secondaryActions?: React.ReactNode;
  }) => (
    <section data-testid="detail-hero">
      <h2>{name}</h2>
      {subtitle && <p>{subtitle}</p>}
      {badges?.map(badge => (
        <span key={badge.label}>{badge.label}</span>
      ))}
      {secondaryActions}
      {footer}
    </section>
  ),
}));

vi.mock('@/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton" className="animate-pulse" />,
}));

vi.mock('@/components/common/ErrorState', () => ({
  ErrorState: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div data-testid="error-state">
      {message}
      {onRetry && <button onClick={onRetry}>Try Again</button>}
    </div>
  ),
}));

vi.mock('@/components/common/NotFoundState', () => ({
  NotFoundState: ({ entityName }: { entityName: string }) => (
    <div data-testid="not-found">{entityName} Not Found</div>
  ),
}));

vi.mock('@/components/shows/overview/QuickInfoCards', () => ({
  QuickInfoCards: ({ show }: { show: { id: string } }) => (
    <div data-testid="quick-info">{show.id}</div>
  ),
}));

vi.mock('@/components/shows/ShowDateBlock', () => ({
  ShowDateBlock: () => <div data-testid="show-date-block" />,
}));

vi.mock('@/components/shows/ShowStatusPill', () => ({
  ShowStatusPill: ({ status }: { status: string }) => <div data-testid="show-status">{status}</div>,
}));

function makeAuthReturn(email: string | null) {
  return {
    user: email ? { id: 'u1', email } : null,
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
}

function renderWorkbench(initialPath = '/secretary/shows/show-1', email = 'secretary@example.com') {
  mockUseAuth.mockReturnValue(makeAuthReturn(email));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/sign-in" element={<div data-testid="sign-in">Sign In</div>} />
            <Route
              path="/secretary/shows/:showId"
              element={
                <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
                  <ShowWorkbenchPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('ShowWorkbenchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShow = {
      id: 'show-1',
      name: 'Bluegrass Classic',
      organization: 'AKC',
      startDate: '2026-03-22',
      endDate: '2026-03-23',
      location: 'Louisville, KY',
      clubName: 'Bluegrass KC',
      status: 'accepting_entries',
      events: [],
      source: 'myK9Show',
      entryOpenDate: '2026-01-01',
      entryCloseDate: '2027-12-31',
      preEntryFee: '$30',
      clubId: 'club-1',
      clubAddress: '',
      clubEmail: '',
      logoUrl: '',
      coverImageUrl: '',
      accentColor: '',
      assignedJudges: [],
      stats: [],
      trials: [],
    };
    mockLoading = false;
    mockError = false;
  });

  it('renders the workbench shell for a secretary', async () => {
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getByTestId('detail-hero')).toHaveTextContent('Bluegrass Classic');
    });
    expect(screen.getByRole('tab', { name: /Setup/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Today/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Wrap-up/ })).toBeInTheDocument();
    expect(screen.getByTestId('quick-info')).toHaveTextContent('show-1');
  });

  it('honors the phase URL param', async () => {
    renderWorkbench('/secretary/shows/show-1?phase=today');

    const todayTab = await screen.findByRole('tab', { name: /Today/ });
    expect(todayTab).toHaveAttribute('aria-selected', 'true');
  });

  it('updates phase when a tab is selected', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(await screen.findByRole('tab', { name: /Wrap-up/ }));

    expect(screen.getByRole('tab', { name: /Wrap-up/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('navigates to the existing edit surface', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(await screen.findByRole('button', { name: /Edit/ }));

    expect(navigateMock).toHaveBeenCalledWith('/shows/show-1?edit=true');
  });

  it('shows the loading state', () => {
    mockLoading = true;

    renderWorkbench();

    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('shows the error state and retries', async () => {
    const user = userEvent.setup();
    mockError = true;
    mockShow = null;

    renderWorkbench();

    expect(screen.getByTestId('error-state')).toHaveTextContent(
      "We couldn't load this show workbench."
    );
    await user.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(refetchMock).toHaveBeenCalled();
  });

  it('shows not found when the show is missing', () => {
    mockShow = null;

    renderWorkbench();

    expect(screen.getByTestId('not-found')).toHaveTextContent('Show Not Found');
  });

  it('denies exhibitor-only access through the protected route', () => {
    renderWorkbench('/secretary/shows/show-1', 'exhibitor@example.com');

    expect(screen.queryByTestId('detail-hero')).not.toBeInTheDocument();
    expect(screen.getByText(/you don't have permission/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated users through the protected route', () => {
    renderWorkbench('/secretary/shows/show-1', null);

    expect(screen.getByTestId('sign-in')).toBeInTheDocument();
  });
});
