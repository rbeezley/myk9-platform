/**
 * Diagnostic Button - Floating Action Button for IndexedDB Diagnostics
 *
 * Shows a diagnostic button when IndexedDB errors are detected.
 * Clicking opens the diagnostic panel with manual cleanup instructions.
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { IndexedDBDiagnosticPanel } from './IndexedDBDiagnosticPanel';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';

/** Tailwind styles for DiagnosticButton */
const styles = {
  fab: cn(
    "fixed z-[var(--token-z-toast)]",
    "bottom-[var(--token-space-2xl)] right-[var(--token-space-2xl)]",
    "w-12 h-12 rounded-full",
    "sm:bottom-[var(--token-space-3xl)] sm:right-[var(--token-space-3xl)]",
    "sm:w-14 sm:h-14",
    "bg-[var(--status-pulled)] text-white",
    "border-none cursor-pointer",
    "shadow-[0_4px_12px_rgba(239,68,68,0.4)]",
    "flex items-center justify-center",
    "transition-all duration-300",
    "animate-[fabPulse_2s_infinite]",
    "hover:scale-110 hover:shadow-[0_6px_16px_rgba(239,68,68,0.6)]",
    "active:scale-95",
    "motion-reduce:animate-none motion-reduce:hover:scale-100"
  ),
  fabIcon: cn(
    "w-6 h-6 relative z-[var(--token-z-raised)]",
    "sm:w-7 sm:h-7"
  ),
  fabPulse: cn(
    "absolute inset-0 rounded-full",
    "bg-[var(--status-pulled)] opacity-60",
    "animate-[diagnosticPulse_2s_infinite]",
    "motion-reduce:animate-none"
  ),
  overlay: cn(
    "fixed inset-0 z-[var(--token-z-toast)]",
    "flex items-center justify-center",
    "bg-black/70 p-[var(--token-space-xl)]",
    "overflow-y-auto",
    "sm:p-0"
  ),
  content: cn(
    "relative w-full max-w-[900px]",
    "max-h-[90vh] overflow-y-auto",
    "bg-[var(--card-background)] rounded-[var(--border-radius-lg)]",
    "shadow-[0_20px_40px_rgba(0,0,0,0.3)]",
    "animate-[modalSlideIn_0.3s_ease-out]",
    "sm:max-h-screen sm:rounded-none",
    "motion-reduce:animate-none"
  ),
  closeBtn: cn(
    "absolute z-[var(--token-z-raised)]",
    "top-[var(--token-space-xl)] right-[var(--token-space-xl)]",
    "sm:top-[var(--token-space-lg)] sm:right-[var(--token-space-lg)]",
    "w-8 h-8 rounded-full",
    "bg-[var(--background-secondary)] border border-[var(--border-color)]",
    "text-[var(--foreground)] cursor-pointer",
    "flex items-center justify-center",
    "transition-all duration-200",
    "hover:bg-[var(--background-tertiary)] hover:rotate-90",
    "[&_svg]:w-[18px] [&_svg]:h-[18px]"
  ),
};

export function DiagnosticButton() {
  const { settings } = useSettingsStore();
  const [showPanel, setShowPanel] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Listen for IndexedDB errors from console
    const errorHandler = (event: ErrorEvent) => {
      if (
        event.message?.includes('IndexedDB') ||
        event.message?.includes('timed out') ||
        event.message?.includes('database')
      ) {
        setHasError(true);
      }
    };

    window.addEventListener('error', errorHandler);

    // Also check console for specific error patterns
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      const message = args.join(' ');
      if (
        message.includes('Failed to open database') ||
        message.includes('Database open timed out') ||
        message.includes('Metadata') ||
        message.includes('IndexedDB')
      ) {
        setHasError(true);
      }
      originalConsoleError.apply(console, args);
    };

    return () => {
      window.removeEventListener('error', errorHandler);
      console.error = originalConsoleError;
    };
  }, []);

  // Only show if developer mode is enabled AND there's an error
  if (!settings.developerMode || (!hasError && !showPanel)) {
    return null;
  }

  return (
    <>
      {/* Floating diagnostic button */}
      {!showPanel && (
        <button
          className={styles.fab}
          onClick={() => setShowPanel(true)}
          aria-label="Open IndexedDB Diagnostics"
          title="IndexedDB Error Detected - Click for diagnostics"
        >
          <AlertTriangle className={styles.fabIcon} />
          <span className={styles.fabPulse}></span>
        </button>
      )}

      {/* Diagnostic panel modal */}
      {showPanel && (
        <div className={styles.overlay} onClick={() => setShowPanel(false)}>
          <div className={styles.content} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.closeBtn}
              onClick={() => setShowPanel(false)}
              aria-label="Close diagnostics"
            >
              <X />
            </button>
            <IndexedDBDiagnosticPanel onClose={() => setShowPanel(false)} />
          </div>
        </div>
      )}
    </>
  );
}
