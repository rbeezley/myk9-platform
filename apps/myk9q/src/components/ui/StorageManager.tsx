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
import './shared-ui.css';

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
      return { label: 'Expired', className: 'storage-expiry-expired' };
    } else if (days === 0) {
      return { label: 'Expires today', className: 'storage-expiry-warning' };
    } else if (days === 1) {
      return { label: 'Expires tomorrow', className: 'storage-expiry-warning' };
    } else if (days <= 3) {
      return { label: `Expires in ${days} days`, className: 'storage-expiry-warning' };
    } else {
      return { label: `Expires in ${days} days`, className: 'storage-expiry-ok' };
    }
  };

  if (isLoading) {
    return (
      <div className="storage-manager">
        <div className="storage-loading">Loading storage data...</div>
      </div>
    );
  }

  return (
    <div className="storage-manager">
      <div className="storage-header">
        <div className="storage-title">
          <HardDrive size={24}  style={{ width: '24px', height: '24px', flexShrink: 0 }} />
          <h2>Offline Storage</h2>
        </div>
        {shows.length > 0 && (
          <button className="storage-cleanup-btn" onClick={handleCleanup}>
            <RefreshCw size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            Cleanup Expired
          </button>
        )}
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="storage-message storage-message-success">
          <Check size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="storage-message storage-message-error">
          <AlertCircle size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
          {errorMessage}
        </div>
      )}

      {/* Storage Usage Summary */}
      <div className="storage-summary">
        <div className="storage-stat">
          <div className="storage-stat-value">{formatBytes(totalBytes)}</div>
          <div className="storage-stat-label">Total Storage</div>
        </div>
        <div className="storage-stat">
          <div className="storage-stat-value">{shows.length}</div>
          <div className="storage-stat-label">{shows.length === 1 ? 'Show' : 'Shows'}</div>
        </div>
        <div className="storage-stat">
          <div className="storage-stat-value">
            {shows.reduce((sum, show) => sum + show.entryCount, 0)}
          </div>
          <div className="storage-stat-label">Total Entries</div>
        </div>
      </div>

      {/* Downloaded Shows List */}
      {shows.length === 0 ? (
        <div className="storage-empty">
          <Download size={48}  style={{ width: '48px', height: '48px', flexShrink: 0 }} />
          <h3>No Downloaded Shows</h3>
          <p>Download shows for offline use to access them without WiFi.</p>
        </div>
      ) : (
        <div className="storage-shows">
          {shows.map((show) => {
            const expiry = getExpiryLabel(show.expiresAt);

            return (
              <div key={show.licenseKey} className="storage-show-card">
                <div className="storage-show-main">
                  <div className="storage-show-info">
                    <h3>{show.showName}</h3>
                    <div className="storage-show-meta">
                      <span>{formatBytes(show.size)}</span>
                      <span>•</span>
                      <span>{show.entryCount} entries</span>
                      <span>•</span>
                      <span>{show.classCount} classes</span>
                    </div>
                    <div className="storage-show-dates">
                      <span>Downloaded {formatDate(show.downloadedAt)}</span>
                      <span className={expiry.className}>{expiry.label}</span>
                    </div>
                  </div>
                  <div className="storage-show-actions">
                    <button
                      className="storage-action-btn storage-action-extend"
                      onClick={() => handleExtend(show.licenseKey, show.showName)}
                      title="Extend for 7 more days"
                    >
                      <RefreshCw size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                      Extend
                    </button>
                    <button
                      className="storage-action-btn storage-action-delete"
                      onClick={() => handleDelete(show.licenseKey, show.showName)}
                      title="Delete offline data"
                    >
                      <Trash2 size={16} />
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
      <div className="storage-tips">
        <h4>Tips</h4>
        <ul>
          <li>Downloaded shows expire after 7 days to save space</li>
          <li>Extend expiration before a show to keep it available</li>
          <li>Delete old shows to free up storage space</li>
          <li>Your changes sync automatically when WiFi returns</li>
        </ul>
      </div>
    </div>
  );
}
