/**
 * PreloadShowDialog Component
 *
 * Allows users to download entire shows for offline use.
 * Shows progress, storage estimates, and manages downloaded shows.
 */

import { useState, useEffect, useRef } from 'react';
import { Download, X, Check, AlertCircle, Trash2, RefreshCw, HardDrive } from 'lucide-react';
import { logger } from '@/utils/logger';
import {
  preloadShow,
  estimateShowSize,
  getAllPreloadedShows,
  deletePreloadedShow,
  isShowPreloaded,
  extendShowExpiration,
  type PreloadProgress,
  type PreloadedShow,
} from '@/services/preloadService';
import './shared-ui.css';

interface PreloadShowDialogProps {
  licenseKey: string;
  showName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function PreloadShowDialog({
  licenseKey,
  showName,
  isOpen,
  onClose,
}: PreloadShowDialogProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<PreloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreloaded, setIsPreloaded] = useState(false);
  const [preloadedShow, setPreloadedShow] = useState<PreloadedShow | null>(null);
  const [estimate, setEstimate] = useState<{
    estimatedBytes: number;
    classCount: number;
    trialCount: number;
    entryCount: number;
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Check if show is already preloaded
  useEffect(() => {
    if (isOpen) {
      checkPreloadStatus();
      getEstimate();
    }
  }, [isOpen, licenseKey]);

  const checkPreloadStatus = async () => {
    const preloaded = await isShowPreloaded(licenseKey);
    setIsPreloaded(preloaded);

    if (preloaded) {
      const shows = await getAllPreloadedShows();
      const show = shows.find((s) => s.licenseKey === licenseKey);
      setPreloadedShow(show || null);
    }
  };

  const getEstimate = async () => {
    try {
      const est = await estimateShowSize(licenseKey);
      setEstimate(est);
    } catch (err) {
      logger.error('Failed to estimate show size:', err);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);
    setProgress(null);

    abortControllerRef.current = new AbortController();

    try {
      const result = await preloadShow({
        licenseKey,
        onProgress: setProgress,
        signal: abortControllerRef.current.signal,
      });

      setPreloadedShow(result);
      setIsPreloaded(true);

      // Auto-close after 2 seconds on success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      if (err instanceof Error && err.message === 'Download cancelled') {
        setError('Download cancelled');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to download show');
      }
    } finally {
      setIsDownloading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsDownloading(false);
    setProgress(null);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete offline data for "${showName}"?`)) return;

    try {
      await deletePreloadedShow(licenseKey);
      setIsPreloaded(false);
      setPreloadedShow(null);
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete show');
    }
  };

  const handleExtend = async () => {
    try {
      const updated = await extendShowExpiration(licenseKey);
      setPreloadedShow(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extend expiration');
    }
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
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStageLabel = (stage: PreloadProgress['stage']): string => {
    switch (stage) {
      case 'preparing':
        return 'Preparing...';
      case 'classes':
        return 'Downloading Classes';
      case 'trials':
        return 'Downloading Trials';
      case 'entries':
        return 'Downloading Entries';
      case 'complete':
        return 'Complete!';
      case 'error':
        return 'Error';
      default:
        return 'Downloading...';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="preload-dialog-overlay" onClick={onClose}>
      <div className="preload-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="preload-dialog-header">
          <h2 className="preload-dialog-title">
            <Download size={24}  style={{ width: '24px', height: '24px', flexShrink: 0 }} />
            Offline Download
          </h2>
          <button className="preload-dialog-close" onClick={onClose}>
            <X size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
          </button>
        </div>

        <div className="preload-dialog-content">
          <div className="preload-show-info">
            <h3>{showName}</h3>
            {estimate && (
              <div className="preload-estimate">
                <HardDrive size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                <span>
                  ~{formatBytes(estimate.estimatedBytes)} • {estimate.entryCount} entries •{' '}
                  {estimate.classCount} classes
                </span>
              </div>
            )}
          </div>

          {/* Already Downloaded */}
          {isPreloaded && preloadedShow && !isDownloading && (
            <div className="preload-status preload-status-success">
              <div className="preload-status-icon">
                <Check size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="preload-status-info">
                <strong>Downloaded</strong>
                <p>Downloaded on {formatDate(preloadedShow.downloadedAt)}</p>
                <p className="preload-status-meta">
                  {formatBytes(preloadedShow.size)} • {preloadedShow.entryCount} entries
                </p>
                <p className="preload-status-expiry">
                  Expires {formatDate(preloadedShow.expiresAt)}
                </p>
              </div>
              <div className="preload-status-actions">
                <button
                  className="preload-btn preload-btn-secondary"
                  onClick={handleExtend}
                  title="Extend for 7 more days"
                >
                  <RefreshCw size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                  Extend
                </button>
                <button
                  className="preload-btn preload-btn-danger"
                  onClick={handleDelete}
                  title="Delete offline data"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>
          )}

          {/* Download Progress */}
          {isDownloading && progress && (
            <div className="preload-progress">
              <div className="preload-progress-stage">{getStageLabel(progress.stage)}</div>
              {progress.currentItem && (
                <div className="preload-progress-item">{progress.currentItem}</div>
              )}
              <div className="preload-progress-bar">
                <div
                  className="preload-progress-fill"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
              <div className="preload-progress-text">
                {progress.current} / {progress.total} ({progress.percentage}%)
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="preload-error">
              <AlertCircle size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Info */}
          {!isPreloaded && !isDownloading && (
            <div className="preload-info">
              <p>
                Download this show for offline use. You'll be able to score entries even without
                WiFi.
              </p>
              <ul>
                <li>All entries, classes, and trials will be saved locally</li>
                <li>Changes sync automatically when WiFi returns</li>
                <li>Data expires after 7 days (can be extended)</li>
              </ul>
            </div>
          )}
        </div>

        <div className="preload-dialog-footer">
          {isDownloading ? (
            <button className="preload-btn preload-btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
          ) : isPreloaded ? (
            <button className="preload-btn preload-btn-primary" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              <button className="preload-btn preload-btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="preload-btn preload-btn-primary" onClick={handleDownload}>
                <Download size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                Download Show
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
