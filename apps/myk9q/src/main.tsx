// Run v2 accent migration BEFORE any module that touches the settings store.
// Must be the very first import so Zustand's persist middleware reads the
// migrated values on first hydration.
import { runAccentMigration } from './utils/accentMigration';
runAccentMigration();

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Phase 0 — the @myk9/ringside package's compiled stylesheet. Required
// for ringside-styled components once they land in PRs C+. Real ringside
// code is now consumed inline by hooks/components, so no proof-of-life
// sentinel import is needed here (was added in PR A and retired in PR B).
import '@myk9/ringside/styles';
import { registerSW } from 'virtual:pwa-register';
import { setupPwaUpdate, applyPwaUpdate } from '@myk9/pwa-update';
import { serviceWorkerManager } from './utils/serviceWorkerUtils';
import { initializeReplication } from './services/replication/initReplication';
import { initSyncStatusListeners } from './stores/syncStatusStore';
import { logger, configureLogger } from '@myk9/core';
import { UpdateToast } from './components/ui/UpdateToast';
import { buildTimestamp } from './config/appVersion';

// Configure logger with myk9q-specific settings reader
configureLogger({
  isDev: import.meta.env.DEV,
  settingsReader: () => {
    try {
      const stored = localStorage.getItem('myK9Q_settings');
      if (stored) {
        const parsed = JSON.parse(stored) as {
          state?: { settings?: { consoleLogging?: 'none' | 'errors' | 'all' } };
        };
        return parsed?.state?.settings?.consoleLogging || 'errors';
      }
    } catch {
      // If parsing fails, default to errors
    }
    return 'errors';
  },
});

// DEV-only: log replication perf measures for Phase 6 SLO work
if (import.meta.env.DEV) {
  window.addEventListener('replication:perf-measure', (event: Event) => {
    const { name, durationMs, ...rest } = (event as CustomEvent).detail ?? {};
    const ms = typeof durationMs === 'number' ? `${durationMs.toFixed(1)}ms` : 'n/a';
    // eslint-disable-next-line no-console
    console.log(`[perf] ${name}: ${ms}`, rest);
  });
}

// Global error handlers - catch unhandled async errors and uncaught exceptions
// These provide a safety net for errors that escape try/catch blocks
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  logger.error('[Unhandled Promise Rejection]', event.reason);
  // Prevent default browser logging (we handle it ourselves)
  event.preventDefault();
});

window.addEventListener('error', (event: ErrorEvent) => {
  // Only log if it's not already handled by React's error boundary
  if (!event.defaultPrevented) {
    logger.error('[Uncaught Error]', event.error || event.message);
  }
});

/**
 * Check if user is currently on a scoresheet page.
 * Update prompts are deferred during active scoring to avoid interrupting work.
 */
const isOnScoresheet = (): boolean => {
  const path = window.location.pathname;
  return path.includes('/score') || path.includes('/entry/');
};

/**
 * Show the PWA update toast.
 * Renders into a separate DOM root to keep it isolated from the main React app.
 */
const showUpdateToast = () => {
  const container = document.getElementById('update-toast-root');
  if (!container) {
    logger.error('[PWA] Update toast container not found');
    return;
  }

  const toastRoot = ReactDOM.createRoot(container);

  const handleUpdate = () => {
    toastRoot.render(<UpdateToast onUpdate={() => {}} onLater={() => {}} isUpdating />);
    void applyPwaUpdate();
  };

  const handleLater = () => {
    toastRoot.unmount();
  };

  toastRoot.render(<UpdateToast onUpdate={handleUpdate} onLater={handleLater} />);
};

if (!import.meta.env.DEV) {
  setupPwaUpdate({
    registerSW,
    version: buildTimestamp,
    onPrompt: showUpdateToast,
    shouldDefer: isOnScoresheet,
    onOfflineReady: () => {
      serviceWorkerManager.initialize().catch(console.error);
    },
    onRegistered: () => {
      serviceWorkerManager.initialize().catch(console.error);
    },
    logger: {
      info: (msg, meta) => logger.log(msg, meta),
      warn: (msg, meta) => logger.warn(msg, meta),
      error: (msg, meta) => logger.error(msg, meta),
    },
  });
}

// Initialize sync status listeners BEFORE replication starts
// This ensures we capture the initial sync success event
initSyncStatusListeners();

// Initialize replication immediately for faster startup
initializeReplication().catch(console.error);

// Debug window interface for development tools
interface DebugWindow extends Window {
  debugForceFullSync?: () => Promise<void>;
  debugInspectCache?: (tableName?: string) => Promise<unknown[] | undefined>;
}

// Expose debug functions (development only)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const debugWindow = window as DebugWindow;

  // Force full sync
  debugWindow.debugForceFullSync = async () => {
    const { triggerFullSync } = await import('./services/replication/initReplication');
    const auth = JSON.parse(localStorage.getItem('myK9Q_auth') || '{}') as {
      showContext?: { licenseKey?: string };
    };
    const licenseKey = auth.showContext?.licenseKey;
    if (!licenseKey) {
      logger.error('❌ No license key found');
      return;
    }
    await triggerFullSync(licenseKey);
  };

  // Inspect cache contents
  debugWindow.debugInspectCache = async (tableName = 'classes') => {
    const { getReplicationManager } = await import('./services/replication/initReplication');
    const manager = getReplicationManager();
    if (!manager) {
      logger.error('❌ ReplicationManager not initialized');
      return;
    }
    const table = manager.getTable(tableName);
    if (!table) {
      logger.error(`❌ Table "${tableName}" not found`);
      return;
    }
    const allRecords = await table.getAll();
    return allRecords;
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
