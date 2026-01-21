/**
 * IndexedDB Diagnostic Panel
 *
 * Displays diagnostic information when IndexedDB is corrupted/locked.
 * Shows manual cleanup instructions to help users recover.
 */

import { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { logger } from '@/utils/logger';
import {
  runIndexedDBDiagnostics,
  getManualCleanupInstructions,
  attemptAutoCleanup,
  type DiagnosticResult
} from '@/utils/indexedDBDiagnostics';
import { cn } from '@/lib/utils';

/** Tailwind styles for IndexedDBDiagnosticPanel */
const styles = {
  panel: cn(
    "max-w-[800px]",
    "m-[var(--token-space-xl)] sm:mx-auto sm:m-[var(--token-space-3xl)]",
    "p-[var(--token-space-xl)] sm:p-[var(--token-space-3xl)]",
    "bg-[var(--card-background)] rounded-[var(--border-radius-lg)]",
    "border border-[var(--border-color)]",
    "shadow-lg"
  ),
  header: cn(
    "flex items-center gap-[var(--token-space-xl)]",
    "mb-[var(--token-space-2xl)] pb-[var(--token-space-xl)]",
    "border-b-2 border-[var(--border-color)]"
  ),
  headerTitle: cn(
    "m-0 text-xl sm:text-2xl",
    "text-[var(--foreground)]"
  ),
  status: cn(
    "p-[var(--token-space-xl)] rounded-[var(--border-radius-md)]",
    "mb-[var(--token-space-2xl)]",
    "text-base font-semibold"
  ),
  statusHealthy: cn(
    "bg-[var(--status-checked-in-bg)] text-[var(--status-checked-in)]",
    "border border-[var(--status-checked-in)]"
  ),
  statusWarning: cn(
    "bg-amber-500/10 text-[var(--status-conflict)]",
    "border border-[var(--status-conflict)]"
  ),
  statusError: cn(
    "bg-red-500/10 text-[var(--status-pulled)]",
    "border border-[var(--status-pulled)]"
  ),
  loading: cn(
    "flex items-center gap-[var(--token-space-lg)]",
    "p-[var(--token-space-xl)]",
    "bg-[var(--background-secondary)] rounded-[var(--border-radius-md)]",
    "mb-[var(--token-space-2xl)]"
  ),
  iconSpin: cn(
    "w-5 h-5 animate-spin"
  ),
  section: "mb-[var(--token-space-3xl)]",
  sectionTitle: cn(
    "m-0 mb-[var(--token-space-xl)]",
    "text-lg font-semibold text-[var(--foreground)]"
  ),
  list: cn(
    "list-none p-0 m-0",
    "bg-[var(--background-secondary)] rounded-[var(--border-radius-md)]",
    "p-[var(--token-space-xl)]"
  ),
  listItem: cn(
    "py-[var(--token-space-md)]",
    "text-[var(--foreground-secondary)]",
    "font-mono text-sm leading-relaxed",
    "border-b border-[var(--border-color)] last:border-b-0"
  ),
  listItemRecommendation: "text-[var(--status-conflict)]",
  actions: cn(
    "flex flex-wrap gap-[var(--token-space-xl)]",
    "my-[var(--token-space-2xl)]",
    "sm:flex-col"
  ),
  btn: cn(
    "py-[var(--token-space-lg)] px-[var(--token-space-2xl)]",
    "rounded-[var(--border-radius-md)]",
    "font-semibold text-sm cursor-pointer",
    "transition-all duration-200 border-none",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "sm:w-full"
  ),
  btnPrimary: cn(
    "bg-[var(--primary)] text-white",
    "hover:enabled:bg-[var(--primary-hover)]"
  ),
  btnSecondary: cn(
    "bg-[var(--background-secondary)] text-[var(--foreground)]",
    "border border-[var(--border-color)]",
    "hover:enabled:bg-[var(--background-tertiary)]"
  ),
  cleanupStatus: cn(
    "p-[var(--token-space-xl)] rounded-[var(--border-radius-md)]",
    "my-[var(--token-space-xl)] font-semibold"
  ),
  cleanupSuccess: cn(
    "bg-[var(--status-checked-in-bg)] text-[var(--status-checked-in)]",
    "border border-[var(--status-checked-in)]"
  ),
  cleanupError: cn(
    "bg-red-500/10 text-[var(--status-pulled)]",
    "border border-[var(--status-pulled)]"
  ),
  manualInstructions: cn(
    "mt-[var(--token-space-3xl)] p-[var(--token-space-2xl)]",
    "bg-[var(--background-secondary)] rounded-[var(--border-radius-md)]",
    "border-2 border-[var(--status-conflict)]"
  ),
  manualTitle: cn(
    "m-0 mb-[var(--token-space-xl)]",
    "text-lg text-[var(--status-conflict)]"
  ),
  instructionsCode: cn(
    "bg-[var(--background)] p-[var(--token-space-2xl)]",
    "rounded-[var(--border-radius-md)]",
    "font-mono text-sm sm:text-xs leading-loose",
    "text-[var(--foreground-secondary)]",
    "overflow-x-auto max-h-[400px] sm:max-h-[300px] overflow-y-auto",
    "[&_div]:whitespace-pre-wrap"
  ),
  footer: cn(
    "mt-[var(--token-space-3xl)] pt-[var(--token-space-xl)]",
    "border-t border-[var(--border-color)]"
  ),
  helpText: cn(
    "m-0 mb-[var(--token-space-lg)]",
    "text-[var(--foreground-secondary)] text-sm"
  ),
  consoleCommand: cn(
    "block p-[var(--token-space-lg)]",
    "bg-[var(--background)] rounded-[var(--border-radius-md)]",
    "font-mono text-sm text-[var(--primary)]",
    "border border-[var(--border-color)]"
  ),
  iconSuccess: "text-[var(--status-checked-in)] w-8 h-8",
  iconWarning: "text-[var(--status-conflict)] w-8 h-8",
  iconError: "text-[var(--status-pulled)] w-8 h-8",
};

interface IndexedDBDiagnosticPanelProps {
  onClose?: () => void;
}

export function IndexedDBDiagnosticPanel({ onClose }: IndexedDBDiagnosticPanelProps) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [autoCleanupStatus, setAutoCleanupStatus] = useState<string | null>(null);

  useEffect(() => {
    // Run diagnostics on mount
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setAutoCleanupStatus(null);
    try {
      const result = await runIndexedDBDiagnostics();
      setDiagnostics(result);
    } catch (error) {
      logger.error('Failed to run diagnostics:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const handleAutoCleanup = async () => {
    setAutoCleanupStatus('Running auto-cleanup...');
    const result = await attemptAutoCleanup();
    setAutoCleanupStatus(result.message);

    if (result.success) {
      // Re-run diagnostics after cleanup
      setTimeout(() => runDiagnostics(), 500);
    }
  };

  const getStatusIcon = () => {
    if (!diagnostics) return <AlertCircle className={styles.iconWarning} />;

    switch (diagnostics.status) {
      case 'healthy':
        return <CheckCircle className={styles.iconSuccess} />;
      case 'locked':
      case 'corrupted':
        return <XCircle className={styles.iconError} />;
      default:
        return <AlertCircle className={styles.iconWarning} />;
    }
  };

  const getStatusStyle = () => {
    if (!diagnostics) return styles.statusWarning;
    switch (diagnostics.status) {
      case 'healthy':
        return styles.statusHealthy;
      case 'locked':
      case 'corrupted':
        return styles.statusError;
      default:
        return styles.statusWarning;
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        {getStatusIcon()}
        <h2 className={styles.headerTitle}>IndexedDB Diagnostic Report</h2>
      </div>

      <div className={cn(styles.status, getStatusStyle())}>
        <strong>Status:</strong> {diagnostics?.status.toUpperCase() || 'CHECKING...'}
      </div>

      {isRunning && (
        <div className={styles.loading}>
          <RefreshCw className={styles.iconSpin} />
          <span>Running diagnostics...</span>
        </div>
      )}

      {diagnostics && (
        <>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Details</h3>
            <ul className={styles.list}>
              {diagnostics.details.map((detail, index) => (
                <li key={index} className={styles.listItem}>{detail}</li>
              ))}
            </ul>
          </div>

          {diagnostics.recommendations.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Recommendations</h3>
              <ul className={styles.list}>
                {diagnostics.recommendations.map((rec, index) => (
                  <li key={index} className={cn(styles.listItem, styles.listItemRecommendation)}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.actions}>
            {diagnostics.canAutoFix && (
              <button
                onClick={handleAutoCleanup}
                className={cn(styles.btn, styles.btnPrimary)}
                disabled={!!autoCleanupStatus}
              >
                {autoCleanupStatus ? 'Cleaning...' : 'Try Auto-Cleanup'}
              </button>
            )}

            <button onClick={runDiagnostics} className={cn(styles.btn, styles.btnSecondary)} disabled={isRunning}>
              Re-run Diagnostics
            </button>

            {onClose && (
              <button onClick={onClose} className={cn(styles.btn, styles.btnSecondary)}>
                Close
              </button>
            )}
          </div>

          {autoCleanupStatus && (
            <div className={cn(styles.cleanupStatus, autoCleanupStatus.includes('success') ? styles.cleanupSuccess : styles.cleanupError)}>
              {autoCleanupStatus}
            </div>
          )}

          {!diagnostics.canAutoFix && diagnostics.status !== 'healthy' && (
            <div className={styles.manualInstructions}>
              <h3 className={styles.manualTitle}>📋 Manual Cleanup Instructions</h3>
              <div className={styles.instructionsCode}>
                {getManualCleanupInstructions().map((instruction, index) => (
                  <div key={index}>{instruction}</div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className={styles.footer}>
        <p className={styles.helpText}>
          💡 <strong>Tip:</strong> You can run diagnostics anytime from the browser console:
        </p>
        <code className={styles.consoleCommand}>window.diagnoseIndexedDB()</code>
      </div>
    </div>
  );
}
