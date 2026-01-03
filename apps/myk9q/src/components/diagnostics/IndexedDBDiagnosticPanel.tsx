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
import './IndexedDBDiagnosticPanel.css';

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
    if (!diagnostics) return <AlertCircle className="icon-warning" />;

    switch (diagnostics.status) {
      case 'healthy':
        return <CheckCircle className="icon-success" />;
      case 'locked':
      case 'corrupted':
        return <XCircle className="icon-error" />;
      default:
        return <AlertCircle className="icon-warning" />;
    }
  };

  const getStatusColor = () => {
    if (!diagnostics) return 'warning';
    switch (diagnostics.status) {
      case 'healthy':
        return 'success';
      case 'locked':
      case 'corrupted':
        return 'error';
      default:
        return 'warning';
    }
  };

  return (
    <div className="diagnostic-panel">
      <div className="diagnostic-header">
        {getStatusIcon()}
        <h2>IndexedDB Diagnostic Report</h2>
      </div>

      <div className={`diagnostic-status status-${getStatusColor()}`}>
        <strong>Status:</strong> {diagnostics?.status.toUpperCase() || 'CHECKING...'}
      </div>

      {isRunning && (
        <div className="diagnostic-loading">
          <RefreshCw className="icon-spin" />
          <span>Running diagnostics...</span>
        </div>
      )}

      {diagnostics && (
        <>
          <div className="diagnostic-section">
            <h3>Details</h3>
            <ul className="diagnostic-list">
              {diagnostics.details.map((detail, index) => (
                <li key={index}>{detail}</li>
              ))}
            </ul>
          </div>

          {diagnostics.recommendations.length > 0 && (
            <div className="diagnostic-section">
              <h3>Recommendations</h3>
              <ul className="diagnostic-list recommendation-list">
                {diagnostics.recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="diagnostic-actions">
            {diagnostics.canAutoFix && (
              <button
                onClick={handleAutoCleanup}
                className="btn-primary"
                disabled={!!autoCleanupStatus}
              >
                {autoCleanupStatus ? 'Cleaning...' : 'Try Auto-Cleanup'}
              </button>
            )}

            <button onClick={runDiagnostics} className="btn-secondary" disabled={isRunning}>
              Re-run Diagnostics
            </button>

            {onClose && (
              <button onClick={onClose} className="btn-secondary">
                Close
              </button>
            )}
          </div>

          {autoCleanupStatus && (
            <div className={`cleanup-status ${autoCleanupStatus.includes('success') ? 'success' : 'error'}`}>
              {autoCleanupStatus}
            </div>
          )}

          {!diagnostics.canAutoFix && diagnostics.status !== 'healthy' && (
            <div className="manual-instructions">
              <h3>📋 Manual Cleanup Instructions</h3>
              <div className="instructions-code">
                {getManualCleanupInstructions().map((instruction, index) => (
                  <div key={index}>{instruction}</div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="diagnostic-footer">
        <p className="help-text">
          💡 <strong>Tip:</strong> You can run diagnostics anytime from the browser console:
        </p>
        <code className="console-command">window.diagnoseIndexedDB()</code>
      </div>
    </div>
  );
}
