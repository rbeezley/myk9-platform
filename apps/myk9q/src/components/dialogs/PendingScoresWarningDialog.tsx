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
import { cn } from '@/lib/utils';

/** Tailwind styles for PendingScoresWarningDialog */
const styles = {
  overlay: cn(
    "fixed inset-0 z-[9999] p-4",
    "flex items-center justify-center",
    "bg-black/70",
    "animate-[pendingFadeIn_0.2s_ease-out]"
  ),
  dialog: cn(
    "w-full max-w-[420px]",
    "bg-[var(--token-bg-primary,#1a1d23)] rounded-2xl",
    "border border-[var(--token-border,#3a3f47)]",
    "p-6",
    "animate-[pendingSlideUp_0.3s_ease-out]"
  ),
  icon: cn(
    "flex justify-center mb-4",
    "text-amber-500"
  ),
  iconOffline: "text-slate-500",
  iconPendingChanges: "text-amber-500",
  title: cn(
    "text-xl font-semibold text-center",
    "text-[var(--token-text-primary,#f1f5f9)]",
    "m-0 mb-3"
  ),
  message: cn(
    "text-center leading-relaxed",
    "text-[var(--token-text-secondary,#94a3b8)]",
    "m-0 mb-2",
    "[&_strong]:text-amber-500"
  ),
  warning: cn(
    "text-center text-sm",
    "text-red-500",
    "m-0 mb-4",
    "[&_strong]:text-red-500"
  ),
  status: cn(
    "flex items-center justify-center gap-2",
    "py-3 px-4",
    "bg-[var(--token-bg-secondary,#2a2f38)] rounded-lg",
    "mb-4 text-sm"
  ),
  statusIcon: "w-[18px] h-[18px] shrink-0",
  statusIconOnline: "text-green-500",
  statusIconSyncing: cn(
    "text-blue-500",
    "animate-[pendingPulse_1.5s_infinite]"
  ),
  statusIconOffline: "text-red-500",
  instructions: cn(
    "bg-[var(--token-bg-secondary,#2a2f38)] rounded-lg",
    "p-4 mb-6"
  ),
  instructionsTitle: cn(
    "text-sm font-semibold m-0 mb-2",
    "text-[var(--token-text-primary,#f1f5f9)]"
  ),
  instructionsList: cn(
    "m-0 mb-4 pl-5",
    "text-[var(--token-text-secondary,#94a3b8)]",
    "text-sm leading-relaxed",
    "[&_li]:mb-1"
  ),
  instructionsText: cn(
    "m-0 text-sm leading-relaxed",
    "text-[var(--token-text-secondary,#94a3b8)]"
  ),
  tip: cn(
    "flex items-start gap-2",
    "p-3 rounded-md",
    "bg-blue-500/10 text-[0.8125rem]",
    "text-slate-400 m-0",
    "[&_svg]:text-blue-500 [&_svg]:shrink-0 [&_svg]:mt-0.5",
    "[&_strong]:text-blue-500"
  ),
  actions: "flex justify-center",
  actionsOffline: "flex justify-center gap-3",
  btn: cn(
    "min-w-[140px] py-3 px-4",
    "rounded-lg font-medium text-sm",
    "cursor-pointer transition-colors duration-150"
  ),
  btnPrimary: cn(
    "bg-[var(--primary)] text-white border-none",
    "hover:bg-[var(--primary-hover)]"
  ),
  btnSecondary: cn(
    "bg-[var(--token-bg-secondary,#2a2f38)]",
    "text-[var(--token-text-primary,#f1f5f9)]",
    "border border-[var(--token-border,#3a3f47)]",
    "hover:bg-[var(--token-bg-tertiary,#3a3f47)]"
  ),
  btnDanger: cn(
    "bg-red-600 text-white border-none",
    "hover:bg-red-700"
  ),
  btnOffline: "flex-1 max-w-[160px]",
};

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
      <div className={styles.overlay} onClick={onClose}>
        <div
          className={styles.dialog}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={cn(styles.icon, styles.iconPendingChanges)}>
            <RefreshCw size={48} />
          </div>

          <h2 className={styles.title}>
            Changes Not Synced
          </h2>

          <p className={styles.message}>
            You have <strong>{pendingMutationCount} change{pendingMutationCount !== 1 ? 's' : ''}</strong> that
            {pendingMutationCount !== 1 ? " haven't" : " hasn't"} been uploaded yet.
          </p>

          <p className={styles.warning}>
            These include class status updates, check-ins, or other changes.
            Logging out will <strong>permanently lose</strong> these changes.
          </p>

          <div className={styles.status}>
            {isOnline ? (
              isSyncing ? (
                <>
                  <Wifi className={cn(styles.statusIcon, styles.statusIconSyncing)} />
                  <span>Syncing in progress... Please wait.</span>
                </>
              ) : (
                <>
                  <Wifi className={cn(styles.statusIcon, styles.statusIconOnline)} />
                  <span>Connected - changes should sync automatically</span>
                </>
              )
            ) : (
              <>
                <WifiOff className={cn(styles.statusIcon, styles.statusIconOffline)} />
                <span>Offline - please reconnect to sync changes</span>
              </>
            )}
          </div>

          <div className={styles.instructions}>
            <h3 className={styles.instructionsTitle}>What to do:</h3>
            <ol className={styles.instructionsList}>
              {!isOnline && (
                <li>Connect to WiFi or cellular data</li>
              )}
              <li>Wait for all changes to sync (check the sync indicator)</li>
              <li>Once synced, you can safely log out</li>
            </ol>

            <p className={styles.tip}>
              <CloudOff size={16} />
              <span>
                <strong>Tip:</strong> You can safely close the app without logging out.
                Your changes will be preserved and sync when you reopen.
              </span>
            </p>
          </div>

          <div className={styles.actions}>
            <button
              className={cn(styles.btn, styles.btnPrimary)}
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
      <div className={styles.overlay} onClick={onClose}>
        <div
          className={styles.dialog}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={cn(styles.icon, styles.iconOffline)}>
            <WifiOff size={48} />
          </div>

          <h2 className={styles.title}>
            You're Offline
          </h2>

          <p className={styles.message}>
            If you logout now, you <strong>won't be able to login</strong> until you have connectivity.
          </p>

          <p className={styles.warning}>
            Login requires an internet connection to verify your passcode.
          </p>

          <div className={styles.instructions}>
            <h3 className={styles.instructionsTitle}>Are you sure?</h3>
            <p className={styles.instructionsText}>
              If you're about to move to an area without WiFi (like an exterior search),
              consider staying logged in so you can continue scoring.
            </p>
          </div>

          <div className={styles.actionsOffline}>
            <button
              className={cn(styles.btn, styles.btnSecondary, styles.btnOffline)}
              onClick={onClose}
            >
              Stay Logged In
            </button>
            {onForceLogout && (
              <button
                className={cn(styles.btn, styles.btnDanger, styles.btnOffline)}
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
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.icon}>
          <AlertTriangle size={48} />
        </div>

        <h2 className={styles.title}>
          Cannot Log Out
        </h2>

        <p className={styles.message}>
          You have <strong>{pendingCount} score{pendingCount !== 1 ? 's' : ''}</strong> that
          {pendingCount !== 1 ? " haven't" : " hasn't"} been uploaded yet.
        </p>

        <p className={styles.warning}>
          Logging out will <strong>permanently delete</strong> these scores.
        </p>

        <div className={styles.status}>
          {isOnline ? (
            isSyncing ? (
              <>
                <Wifi className={cn(styles.statusIcon, styles.statusIconSyncing)} />
                <span>Syncing in progress... Please wait.</span>
              </>
            ) : (
              <>
                <Wifi className={cn(styles.statusIcon, styles.statusIconOnline)} />
                <span>Connected - scores should sync automatically</span>
              </>
            )
          ) : (
            <>
              <WifiOff className={cn(styles.statusIcon, styles.statusIconOffline)} />
              <span>Offline - please reconnect to upload scores</span>
            </>
          )}
        </div>

        <div className={styles.instructions}>
          <h3 className={styles.instructionsTitle}>What to do:</h3>
          <ol className={styles.instructionsList}>
            {!isOnline && (
              <li>Connect to WiFi or cellular data</li>
            )}
            <li>Wait for all scores to sync (check the sync indicator)</li>
            <li>Once synced, you can safely log out</li>
          </ol>

          <p className={styles.tip}>
            <CloudOff size={16} />
            <span>
              <strong>Tip:</strong> You can safely close the app without logging out.
              Your scores will be preserved and sync when you reopen.
            </span>
          </p>
        </div>

        <div className={styles.actions}>
          <button
            className={cn(styles.btn, styles.btnPrimary)}
            onClick={onClose}
          >
            OK, I'll Wait
          </button>
        </div>
      </div>
    </div>
  );
};
