import { ReactNode } from 'react';
import { PWAInstallBanner } from '../PWAInstallBanner';
import { DatabaseRecovery } from '../diagnostics/DatabaseRecovery';
import { AutoLogoutWarning } from '../ui/AutoLogoutWarning';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { OfflineIndicator, OfflineQueueStatus } from '../ui';
import { SubscriptionMonitor } from '../debug/SubscriptionMonitor';

interface AutoLogoutState {
  showWarning: boolean;
  secondsRemaining: number;
  extendSession: () => void;
  logoutNow: () => void;
  dismissWarning: () => void;
}

interface MainLayoutProps {
  children: ReactNode;
  autoLogout: AutoLogoutState;
}

/**
 * Main application layout component
 *
 * Provides a consistent layout structure including:
 * - PWA installation banner
 * - Database recovery UI
 * - Auto-logout warning
 * - Notification center (Inbox panel)
 * - Offline indicators
 * - Subscription monitor (dev tool for leak detection)
 *
 * @param children - The main application content (typically Routes)
 * @param autoLogout - Auto-logout state and callbacks
 */
export function MainLayout({ children, autoLogout }: MainLayoutProps) {
  return (
    <>
      <PWAInstallBanner />
      <DatabaseRecovery />

      {autoLogout.showWarning && (
        <AutoLogoutWarning
          secondsRemaining={autoLogout.secondsRemaining}
          onExtend={autoLogout.extendSession}
          onLogoutNow={autoLogout.logoutNow}
          onDismiss={autoLogout.dismissWarning}
        />
      )}

      <NotificationCenter />
      <OfflineIndicator />
      <OfflineQueueStatus />

      {/* Developer Tools - Subscription Monitor for leak detection */}
      <SubscriptionMonitor />

      {/* Main Application Content */}
      {children}
    </>
  );
}
