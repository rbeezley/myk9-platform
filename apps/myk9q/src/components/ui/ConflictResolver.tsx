/**
 * ConflictResolver Component
 *
 * Displays and resolves data conflicts that occur during sync.
 * Allows users to choose between local, remote, or merged data.
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, X, Check, GitMerge } from 'lucide-react';
import { logger } from '@/utils/logger';
import {
  getPendingConflicts,
  resolveConflict,
  ignoreConflict,
  autoResolveConflict,
  getConflictSummary,
  type Conflict,
  type ConflictResolution,
} from '@/services/conflictResolution';
import './shared-ui.css';

export function ConflictResolver() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    loadConflicts();

    // Poll for new conflicts every 5 seconds
    const interval = setInterval(loadConflicts, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadConflicts = () => {
    const pending = getPendingConflicts();
    setConflicts(pending);

    // Auto-select first conflict if none selected
    if (!selectedConflict && pending.length > 0) {
      setSelectedConflict(pending[0]);
    }
  };

  const handleResolve = async (resolution: ConflictResolution) => {
    if (!selectedConflict) return;

    setIsResolving(true);
    try {
      await resolveConflict(selectedConflict.id, resolution);

      // Move to next conflict
      const remaining = conflicts.filter((c) => c.id !== selectedConflict.id);
      setConflicts(remaining);
      setSelectedConflict(remaining.length > 0 ? remaining[0] : null);
    } catch (error) {
      logger.error('Failed to resolve conflict:', error);
      alert('Failed to resolve conflict. Please try again.');
    } finally {
      setIsResolving(false);
    }
  };

  const handleIgnore = () => {
    if (!selectedConflict) return;

    ignoreConflict(selectedConflict.id);

    const remaining = conflicts.filter((c) => c.id !== selectedConflict.id);
    setConflicts(remaining);
    setSelectedConflict(remaining.length > 0 ? remaining[0] : null);
  };

  const handleAutoResolve = () => {
    if (!selectedConflict) return;

    const resolution = autoResolveConflict(selectedConflict);
    if (resolution) {
      handleResolve(resolution);
    } else {
      alert('Cannot auto-resolve this conflict. Please choose manually.');
    }
  };

  if (conflicts.length === 0) {
    return null; // No conflicts to show
  }

  const summary = selectedConflict ? getConflictSummary(selectedConflict) : null;

  return (
    <div className="conflict-resolver">
      <div className="conflict-banner">
        <div className="conflict-banner-content">
          <AlertTriangle size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
          <span>
            <strong>{conflicts.length}</strong> {conflicts.length === 1 ? 'conflict' : 'conflicts'}{' '}
            need{conflicts.length === 1 ? 's' : ''} resolution
          </span>
        </div>
      </div>

      {selectedConflict && summary && (
        <div className="conflict-dialog-overlay">
          <div className="conflict-dialog">
            <div className="conflict-dialog-header">
              <div className="conflict-dialog-title">
                <AlertTriangle size={24}  style={{ width: '24px', height: '24px', flexShrink: 0 }} />
                {summary.title}
              </div>
              <button className="conflict-dialog-close" onClick={handleIgnore}>
                <X size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </button>
            </div>

            <div className="conflict-dialog-content">
              <p className="conflict-description">{summary.description}</p>

              <div className="conflict-timestamp">
                <span>Local: {new Date(selectedConflict.localTimestamp).toLocaleString()}</span>
                <span>Remote: {new Date(selectedConflict.remoteTimestamp).toLocaleString()}</span>
              </div>

              <div className="conflict-options">
                {/* Local Version */}
                <div className="conflict-option">
                  <div className="conflict-option-header">
                    <input
                      type="radio"
                      id="conflict-local"
                      name="conflict-choice"
                      value="local"
                    />
                    <label htmlFor="conflict-local">
                      <strong>Use Your Version</strong>
                      <span>{summary.localLabel}</span>
                    </label>
                  </div>
                  <button
                    className="conflict-btn conflict-btn-primary"
                    onClick={() => handleResolve({ action: 'local' })}
                    disabled={isResolving}
                  >
                    <Check size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                    Use Local
                  </button>
                </div>

                {/* Remote Version */}
                <div className="conflict-option">
                  <div className="conflict-option-header">
                    <input
                      type="radio"
                      id="conflict-remote"
                      name="conflict-choice"
                      value="remote"
                    />
                    <label htmlFor="conflict-remote">
                      <strong>Use Remote Version</strong>
                      <span>{summary.remoteLabel}</span>
                    </label>
                  </div>
                  <button
                    className="conflict-btn conflict-btn-secondary"
                    onClick={() => handleResolve({ action: 'remote' })}
                    disabled={isResolving}
                  >
                    <Check size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                    Use Remote
                  </button>
                </div>

                {/* Auto-Merge */}
                <div className="conflict-option conflict-option-merge">
                  <div className="conflict-option-header">
                    <GitMerge size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
                    <span>
                      <strong>Try Auto-Merge</strong>
                      <span className="conflict-option-note">
                        Combines both versions if possible
                      </span>
                    </span>
                  </div>
                  <button
                    className="conflict-btn conflict-btn-merge"
                    onClick={handleAutoResolve}
                    disabled={isResolving}
                  >
                    <GitMerge size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                    Auto-Merge
                  </button>
                </div>
              </div>

              {/* JSON View for Advanced Users */}
              <details className="conflict-details">
                <summary>View Raw Data</summary>
                <div className="conflict-json">
                  <div>
                    <strong>Local:</strong>
                    <pre>{JSON.stringify(selectedConflict.localData, null, 2)}</pre>
                  </div>
                  <div>
                    <strong>Remote:</strong>
                    <pre>{JSON.stringify(selectedConflict.remoteData, null, 2)}</pre>
                  </div>
                </div>
              </details>
            </div>

            <div className="conflict-dialog-footer">
              <div className="conflict-counter">
                Conflict {conflicts.indexOf(selectedConflict) + 1} of {conflicts.length}
              </div>
              <button className="conflict-btn conflict-btn-text" onClick={handleIgnore}>
                Skip for Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
