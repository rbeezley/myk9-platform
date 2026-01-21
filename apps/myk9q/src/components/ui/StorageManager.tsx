/**
 * StorageManager Component
 *
 * Provides a UI for managing offline storage:
 * - View all downloaded shows
 * - See storage usage
 * - Delete old shows
 * - Cleanup expired data
 */

import { useState, useEffect } from 'react';
import { HardDrive, Trash2, RefreshCw, AlertCircle, Check, Download } from 'lucide-react';
import { logger } from '@/utils/logger';
import {
  deletePreloadedShow,
  getTotalStorageUsage,
  cleanupExpiredShows,
  extendShowExpiration,
  type PreloadedShow,
} from '@/services/preloadService';
import { cn } from '@/lib/utils';

/** Tailwind styles for StorageManager */
const styles = {
  container: cn(
    "p-6 bg-[var(--card)] rounded-2xl",
    "border border-[var(--border)] shadow-sm"
  ),
  loading: cn(
    "flex items-center justify-center py-12",
    "text-[var(--muted-foreground)]"
  ),
  header: cn(
    "flex items-center justify-between mb-6",
    "flex-wrap gap-4"
  ),
  title: "flex items-center gap-3 text-xl font-semibold text-[var(--foreground)]",
  cleanupBtn: cn(
    "flex items-center gap-2 px-4 py-2 rounded-lg",
    "bg-[var(--muted)] text-[var(--foreground)] text-sm font-medium",
    "hover:bg-[var(--border)] transition-colors duration-150"
  ),
  message: cn(
    "flex items-center gap-2 px-4 py-3 rounded-lg mb-4",
    "text-sm font-medium"
  ),
  messageSuccess: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  messageError: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  summary: cn(
    "grid grid-cols-3 gap-4 mb-6",
    "p-4 bg-[var(--muted)]/50 rounded-xl"
  ),
  stat: "text-center",
  statValue: "text-2xl font-bold text-[var(--foreground)]",
  statLabel: "text-xs text-[var(--muted-foreground)] uppercase tracking-wide",
  empty: cn(
    "flex flex-col items-center justify-center py-12",
    "text-center text-[var(--muted-foreground)]"
  ),
  emptyTitle: "text-lg font-semibold text-[var(--foreground)] mt-4 mb-2",
  emptyText: "text-sm max-w-xs",
  showsList: "space-y-3",
  showCard: cn(
    "p-4 bg-[var(--muted)]/30 rounded-xl",
    "border border-[var(--border)]",
    "transition-colors duration-150",
    "hover:bg-[var(--muted)]/50"
  ),
  showMain: "flex items-start justify-between gap-4 flex-wrap",
  showInfo: "flex-1 min-w-0",
  showName: "text-base font-semibold text-[var(--foreground)] mb-1",
  showMeta: cn(
    "flex items-center gap-2 flex-wrap",
    "text-xs text-[var(--muted-foreground)] mb-2"
  ),
  showDates: cn(
    "flex items-center gap-3 flex-wrap",
    "text-xs text-[var(--muted-foreground)]"
  ),
  showActions: "flex items-center gap-2 shrink-0",
  actionBtn: cn(
    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
    "text-xs font-medium transition-colors duration-150"
  ),
  actionExtend: cn(
    "bg-blue-100 text-blue-700",
    "hover:bg-blue-200",
    "dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
  ),
  actionDelete: cn(
    "bg-red-100 text-red-700",
    "hover:bg-red-200",
    "dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
  ),
  expiryExpired: "text-red-600 dark:text-red-400 font-medium",
  expiryWarning: "text-amber-600 dark:text-amber-400 font-medium",
  expiryOk: "text-green-600 dark:text-green-400",
  tips: cn(
    "mt-6 p-4 bg-[var(--muted)]/30 rounded-xl",
    "border border-[var(--border)]"
  ),
  tipsTitle: "text-sm font-semibold text-[var(--foreground)] mb-2",
  tipsList: cn(
    "list-disc list-inside space-y-1",
    "text-xs text-[var(--muted-foreground)]"
  ),
};

export function StorageManager() {
  const [shows, setShows] = useState<PreloadedShow[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadStorageData();
  }, []);

  const loadStorageData = async () => {
    setIsLoading(true);
    try {
      const storage = await getTotalStorageUsage();
      setShows(storage.shows);
      setTotalBytes(storage.totalBytes);
    } catch (error) {
      logger.error('Failed to load storage data:', error);
      setErrorMessage('Failed to load storage data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (licenseKey: string, showName: string) => {
    if (!confirm(`Delete offline data for "${showName}"?`)) return;

    try {
      await deletePreloadedShow(licenseKey);
      await loadStorageData();
      showSuccess(`Deleted "${showName}"`);
    } catch (error) {
      logger.error('Failed to delete show:', error);
      setErrorMessage('Failed to delete show');
    }
  };

  const handleExtend = async (licenseKey: string, showName: string) => {
    try {
      await extendShowExpiration(licenseKey);
      await loadStorageData();
      showSuccess(`Extended "${showName}" for 7 more days`);
    } catch (error) {
      logger.error('Failed to extend show:', error);
      setErrorMessage('Failed to extend show');
    }
  };

  const handleCleanup = async () => {
    try {
      const deletedCount = await cleanupExpiredShows();
      await loadStorageData();

      if (deletedCount > 0) {
        showSuccess(`Cleaned up ${deletedCount} expired show(s)`);
      } else {
        showSuccess('No expired shows to clean up');
      }
    } catch (error) {
      logger.error('Failed to cleanup:', error);
      setErrorMessage('Failed to cleanup expired shows');
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysUntilExpiry = (expiresAt: number): number => {
    const now = Date.now();
    const diff = expiresAt - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getExpiryLabel = (expiresAt: number): { label: string; className: string } => {
    const days = getDaysUntilExpiry(expiresAt);

    if (days < 0) {
      return { label: 'Expired', className: styles.expiryExpired };
    } else if (days === 0) {
      return { label: 'Expires today', className: styles.expiryWarning };
    } else if (days === 1) {
      return { label: 'Expires tomorrow', className: styles.expiryWarning };
    } else if (days <= 3) {
      return { label: `Expires in ${days} days`, className: styles.expiryWarning };
    } else {
      return { label: `Expires in ${days} days`, className: styles.expiryOk };
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading storage data...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <HardDrive size={24} className="shrink-0" />
          <h2>Offline Storage</h2>
        </div>
        {shows.length > 0 && (
          <button className={styles.cleanupBtn} onClick={handleCleanup}>
            <RefreshCw size={16} className="shrink-0" />
            Cleanup Expired
          </button>
        )}
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className={cn(styles.message, styles.messageSuccess)}>
          <Check size={16} className="shrink-0" />
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className={cn(styles.message, styles.messageError)}>
          <AlertCircle size={16} className="shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Storage Usage Summary */}
      <div className={styles.summary}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{formatBytes(totalBytes)}</div>
          <div className={styles.statLabel}>Total Storage</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{shows.length}</div>
          <div className={styles.statLabel}>{shows.length === 1 ? 'Show' : 'Shows'}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>
            {shows.reduce((sum, show) => sum + show.entryCount, 0)}
          </div>
          <div className={styles.statLabel}>Total Entries</div>
        </div>
      </div>

      {/* Downloaded Shows List */}
      {shows.length === 0 ? (
        <div className={styles.empty}>
          <Download size={48} className="shrink-0 text-[var(--muted-foreground)]" />
          <h3 className={styles.emptyTitle}>No Downloaded Shows</h3>
          <p className={styles.emptyText}>Download shows for offline use to access them without WiFi.</p>
        </div>
      ) : (
        <div className={styles.showsList}>
          {shows.map((show) => {
            const expiry = getExpiryLabel(show.expiresAt);

            return (
              <div key={show.licenseKey} className={styles.showCard}>
                <div className={styles.showMain}>
                  <div className={styles.showInfo}>
                    <h3 className={styles.showName}>{show.showName}</h3>
                    <div className={styles.showMeta}>
                      <span>{formatBytes(show.size)}</span>
                      <span>•</span>
                      <span>{show.entryCount} entries</span>
                      <span>•</span>
                      <span>{show.classCount} classes</span>
                    </div>
                    <div className={styles.showDates}>
                      <span>Downloaded {formatDate(show.downloadedAt)}</span>
                      <span className={expiry.className}>{expiry.label}</span>
                    </div>
                  </div>
                  <div className={styles.showActions}>
                    <button
                      className={cn(styles.actionBtn, styles.actionExtend)}
                      onClick={() => handleExtend(show.licenseKey, show.showName)}
                      title="Extend for 7 more days"
                    >
                      <RefreshCw size={16} className="shrink-0" />
                      Extend
                    </button>
                    <button
                      className={cn(styles.actionBtn, styles.actionDelete)}
                      onClick={() => handleDelete(show.licenseKey, show.showName)}
                      title="Delete offline data"
                    >
                      <Trash2 size={16} className="shrink-0" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Storage Tips */}
      <div className={styles.tips}>
        <h4 className={styles.tipsTitle}>Tips</h4>
        <ul className={styles.tipsList}>
          <li>Downloaded shows expire after 7 days to save space</li>
          <li>Extend expiration before a show to keep it available</li>
          <li>Delete old shows to free up storage space</li>
          <li>Your changes sync automatically when WiFi returns</li>
        </ul>
      </div>
    </div>
  );
}
