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
import './DiagnosticButton.css';

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
          className="diagnostic-fab"
          onClick={() => setShowPanel(true)}
          aria-label="Open IndexedDB Diagnostics"
          title="IndexedDB Error Detected - Click for diagnostics"
        >
          <AlertTriangle className="fab-icon" />
          <span className="fab-pulse"></span>
        </button>
      )}

      {/* Diagnostic panel modal */}
      {showPanel && (
        <div className="diagnostic-modal-overlay" onClick={() => setShowPanel(false)}>
          <div className="diagnostic-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="diagnostic-modal-close"
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
