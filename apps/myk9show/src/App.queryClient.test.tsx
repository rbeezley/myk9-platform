import type { ReactNode } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { render } from '@/test/utils/testUtils';
import { queryClient } from '@/lib/queryClient';
import App from './App';

let routedClient: QueryClient | undefined;

vi.mock('react-router-dom', async importOriginal => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...original,
    Outlet: () => {
      routedClient = useQueryClient();
      return <div>Routed content</div>;
    },
  };
});

vi.mock('@/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: null, userWithRoles: null, rbacLoading: false }),
}));

vi.mock('@/hooks/useAnnouncementSubscription', () => ({
  useAnnouncementSubscription: vi.fn(),
}));
vi.mock('@/hooks/useMessageSubscription', () => ({ useMessageSubscription: vi.fn() }));
vi.mock('@/hooks/useNotificationMonitor', () => ({ useNotificationMonitor: vi.fn() }));

vi.mock('./components/common/NetworkStatusProvider', () => ({
  NetworkStatusProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./context/AudioSettingsContext', () => ({
  AudioSettingsProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./providers/StoreProvider', () => ({
  StoreProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./providers/ReplicationSyncProvider', () => ({
  ReplicationSyncProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./components/navigation/UnsavedChangesRouteGuard', () => ({
  UnsavedChangesRouteGuardProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./components/layout/AppShellMobileNavProvider', () => ({
  AppShellMobileNavProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./components/exhibitor', () => ({
  ExhibitorOnboardingChecker: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./components/common/ErrorBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('./components/layout/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/notifications/NotificationCenter', () => ({
  NotificationCenter: () => null,
}));
vi.mock('@/components/notifications/ToastContainer', () => ({ ToastContainer: () => null }));
vi.mock('@/components/layout/AppToaster', () => ({ AppToaster: () => null }));
vi.mock('./components/pwa/PWAInstallBanner', () => ({ PWAInstallBanner: () => null }));
vi.mock('./components/common/RbacOfflineNotice', () => ({ RbacOfflineNotice: () => null }));
vi.mock('./services/error/GlobalErrorHandler', () => ({
  GlobalErrorHandler: { getInstance: () => ({ initialize: vi.fn() }) },
}));

describe('App query client ownership', () => {
  beforeEach(() => {
    routedClient = undefined;
  });

  it('does not shadow the configured client for routed content', () => {
    render(<App />, { queryClient });

    expect(routedClient).toBe(queryClient);
  });
});
