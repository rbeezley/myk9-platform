/**
 * PendingScoresWarningDialog
 *
 * Shows warnings when a user attempts to logout:
 * 1. pending_scores - Blocks logout because unsynced scores would be lost
 * 2. pending_changes - Blocks logout because unsynced mutations (class status, etc.) would be lost
 * 3. offline - Warns that they can't log back in without connectivity
 */

import React from 'react';
import { AlertTriangle, WifiOff, Wifi, CloudOff, RefreshCw } from 'lucide-react';
import type { LogoutWarningType } from '@/hooks/useSafeLogout';
import './PendingScoresWarningDialog.css';

interface PendingScoresWarningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  warningType: LogoutWarningType;
  pendingCount: number;
  pendingMutationCount?: number; // For pending_changes warning
  isOnline: boolean;
  isSyncing: boolean;
  onForceLogout?: () => void; // Used for offline warning to allow proceeding
}

export const PendingScoresWarningDialog: React.FC<PendingScoresWarningDialogProps> = ({
  isOpen,
  onClose,
  warningType,
  pendingCount,
  pendingMutationCount = 0,
  isOnline,
  isSyncing,
  onForceLogout,
}) => {
  if (!isOpen) return null;

  // Render pending_changes warning (non-score mutations like class status)
  if (warningType === 'pending_changes') {
    return (
      <div className="pending-scores-dialog-overlay" onClick={onClose}>
        <div
          className="pending-scores-dialog"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pending-scores-dialog-icon pending-changes-warning">
            <RefreshCw size={48} />
          </div>

          <h2 className="pending-scores-dialog-title">
            Changes Not Synced
          </h2>

          <p className="pending-scores-dialog-message">
            You have <strong>{pendingMutationCount} change{pendingMutationCount !== 1 ? 's' : ''}</strong> that
            {pendingMutationCount !== 1 ? " haven't" : " hasn't"} been uploaded yet.
          </p>

          <p className="pending-scores-dialog-warning">
            These include class status updates, check-ins, or other changes.
            Logging out will <strong>permanently lose</strong> these changes.
          </p>

          <div className="pending-scores-dialog-status">
            {isOnline ? (
              isSyncing ? (
                <>
                  <Wifi className="status-icon syncing" />
                  <span>Syncing in progress... Please wait.</span>
                </>
              ) : (
                <>
                  <Wifi className="status-icon online" />
                  <span>Connected - changes should sync automatically</span>
                </>
              )
            ) : (
              <>
                <WifiOff className="status-icon offline" />
                <span>Offline - please reconnect to sync changes</span>
              </>
            )}
          </div>

          <div className="pending-scores-dialog-instructions">
            <h3>What to do:</h3>
            <ol>
              {!isOnline && (
                <li>Connect to WiFi or cellular data</li>
              )}
              <li>Wait for all changes to sync (check the sync indicator)</li>
              <li>Once synced, you can safely log out</li>
            </ol>

            <p className="pending-scores-dialog-tip">
              <CloudOff size={16} />
              <span>
                <strong>Tip:</strong> You can safely close the app without logging out.
                Your changes will be preserved and sync when you reopen.
              </span>
            </p>
          </div>

          <div className="pending-scores-dialog-actions">
            <button
              className="btn btn-primary"
              onClick={onClose}
            >
              OK, I'll Wait
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render different content based on warning type
  if (warningType === 'offline') {
    return (
      <div className="pending-scores-dialog-overlay" onClick={onClose}>
        <div
          className="pending-scores-dialog"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pending-scores-dialog-icon offline-warning">
            <WifiOff size={48} />
          </div>

          <h2 className="pending-scores-dialog-title">
            You're Offline
          </h2>

          <p className="pending-scores-dialog-message">
            If you logout now, you <strong>won't be able to login</strong> until you have connectivity.
          </p>

          <p className="pending-scores-dialog-warning">
            Login requires an internet connection to verify your passcode.
          </p>

          <div className="pending-scores-dialog-instructions">
            <h3>Are you sure?</h3>
            <p>
              If you're about to move to an area without WiFi (like an exterior search),
              consider staying logged in so you can continue scoring.
            </p>
          </div>

          <div className="pending-scores-dialog-actions offline-actions">
            <button
              className="btn btn-secondary"
              onClick={onClose}
            >
              Stay Logged In
            </button>
            {onForceLogout && (
              <button
                className="btn btn-danger"
                onClick={onForceLogout}
              >
                Logout Anyway
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default: pending_scores warning
  return (
    <div className="pending-scores-dialog-overlay" onClick={onClose}>
      <div
        className="pending-scores-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pending-scores-dialog-icon">
          <AlertTriangle size={48} />
        </div>

        <h2 className="pending-scores-dialog-title">
          Cannot Log Out
        </h2>

        <p className="pending-scores-dialog-message">
          You have <strong>{pendingCount} score{pendingCount !== 1 ? 's' : ''}</strong> that
          {pendingCount !== 1 ? " haven't" : " hasn't"} been uploaded yet.
        </p>

        <p className="pending-scores-dialog-warning">
          Logging out will <strong>permanently delete</strong> these scores.
        </p>

        <div className="pending-scores-dialog-status">
          {isOnline ? (
            isSyncing ? (
              <>
                <Wifi className="status-icon syncing" />
                <span>Syncing in progress... Please wait.</span>
              </>
            ) : (
              <>
                <Wifi className="status-icon online" />
                <span>Connected - scores should sync automatically</span>
              </>
            )
          ) : (
            <>
              <WifiOff className="status-icon offline" />
              <span>Offline - please reconnect to upload scores</span>
            </>
          )}
        </div>

        <div className="pending-scores-dialog-instructions">
          <h3>What to do:</h3>
          <ol>
            {!isOnline && (
              <li>Connect to WiFi or cellular data</li>
            )}
            <li>Wait for all scores to sync (check the sync indicator)</li>
            <li>Once synced, you can safely log out</li>
          </ol>

          <p className="pending-scores-dialog-tip">
            <CloudOff size={16} />
            <span>
              <strong>Tip:</strong> You can safely close the app without logging out.
              Your scores will be preserved and sync when you reopen.
            </span>
          </p>
        </div>

        <div className="pending-scores-dialog-actions">
          <button
            className="btn btn-primary"
            onClick={onClose}
          >
            OK, I'll Wait
          </button>
        </div>
      </div>
    </div>
  );
};
