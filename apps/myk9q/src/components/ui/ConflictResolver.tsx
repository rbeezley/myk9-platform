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
import { cn } from '../../lib/utils';

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

  const styles = {
    banner: cn(
      "fixed top-0 left-0 right-0 z-[1000]",
      "bg-amber-500 text-white",
      "px-4 py-3 shadow-lg"
    ),
    bannerContent: "flex items-center justify-center gap-2 text-sm font-medium",
    overlay: cn(
      "fixed inset-0 z-[1001]",
      "bg-black/50 backdrop-blur-sm",
      "flex items-center justify-center p-4",
      "animate-fade-in"
    ),
    dialog: cn(
      "bg-white dark:bg-[var(--card)] rounded-2xl shadow-2xl",
      "max-w-md w-full max-h-[90vh] overflow-hidden",
      "flex flex-col"
    ),
    header: cn(
      "flex items-center justify-between",
      "px-6 py-4 border-b border-[var(--border)]"
    ),
    title: "flex items-center gap-3 text-lg font-semibold text-amber-600",
    closeBtn: cn(
      "p-2 rounded-lg text-[var(--muted-foreground)]",
      "hover:bg-[var(--muted)] transition-colors"
    ),
    content: "px-6 py-4 overflow-y-auto flex-1",
    option: cn(
      "flex items-center justify-between gap-4",
      "p-4 rounded-xl border border-[var(--border)]",
      "hover:border-[var(--primary)] hover:bg-[var(--muted)]/50",
      "transition-all duration-200 mb-3"
    ),
    optionMerge: "border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-900/20",
    btn: cn(
      "flex items-center gap-2 px-4 py-2 rounded-lg",
      "text-sm font-medium transition-all duration-200",
      "disabled:opacity-50 disabled:cursor-not-allowed"
    ),
    btnPrimary: "bg-[var(--primary)] text-white hover:opacity-90",
    btnSecondary: "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)]",
    btnMerge: "bg-purple-500 text-white hover:bg-purple-600",
    btnText: "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
    footer: cn(
      "flex items-center justify-between",
      "px-6 py-4 border-t border-[var(--border)] bg-[var(--muted)]/30"
    ),
  };

  return (
    <div>
      <div className={styles.banner}>
        <div className={styles.bannerContent}>
          <AlertTriangle size={20} className="shrink-0" />
          <span>
            <strong>{conflicts.length}</strong> {conflicts.length === 1 ? 'conflict' : 'conflicts'}{' '}
            need{conflicts.length === 1 ? 's' : ''} resolution
          </span>
        </div>
      </div>

      {selectedConflict && summary && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <div className={styles.header}>
              <div className={styles.title}>
                <AlertTriangle size={24} className="shrink-0" />
                {summary.title}
              </div>
              <button className={styles.closeBtn} onClick={handleIgnore}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.content}>
              <p className="text-[var(--muted-foreground)] mb-4">{summary.description}</p>

              <div className="flex gap-4 text-xs text-[var(--muted-foreground)] mb-6 flex-wrap">
                <span>Local: {typeof selectedConflict.localTimestamp === 'number' ? new Date(selectedConflict.localTimestamp).toLocaleString() : 'Recently'}</span>
                <span>Remote: {typeof selectedConflict.remoteTimestamp === 'number' ? new Date(selectedConflict.remoteTimestamp).toLocaleString() : 'Unknown'}</span>
              </div>

              <div className="space-y-3">
                {/* Local Version */}
                <div className={styles.option}>
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      id="conflict-local"
                      name="conflict-choice"
                      value="local"
                      className="w-4 h-4"
                    />
                    <label htmlFor="conflict-local" className="cursor-pointer">
                      <strong className="block text-sm">Use Your Version</strong>
                      <span className="text-xs text-[var(--muted-foreground)]">{summary.localLabel}</span>
                    </label>
                  </div>
                  <button
                    className={cn(styles.btn, styles.btnPrimary)}
                    onClick={() => handleResolve({ action: 'local' })}
                    disabled={isResolving}
                  >
                    <Check size={16} />
                    Use Local
                  </button>
                </div>

                {/* Remote Version */}
                <div className={styles.option}>
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      id="conflict-remote"
                      name="conflict-choice"
                      value="remote"
                      className="w-4 h-4"
                    />
                    <label htmlFor="conflict-remote" className="cursor-pointer">
                      <strong className="block text-sm">Use Remote Version</strong>
                      <span className="text-xs text-[var(--muted-foreground)]">{summary.remoteLabel}</span>
                    </label>
                  </div>
                  <button
                    className={cn(styles.btn, styles.btnSecondary)}
                    onClick={() => handleResolve({ action: 'remote' })}
                    disabled={isResolving}
                  >
                    <Check size={16} />
                    Use Remote
                  </button>
                </div>

                {/* Auto-Merge */}
                <div className={cn(styles.option, styles.optionMerge)}>
                  <div className="flex items-center gap-3">
                    <GitMerge size={20} className="text-purple-500 shrink-0" />
                    <div>
                      <strong className="block text-sm">Try Auto-Merge</strong>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        Combines both versions if possible
                      </span>
                    </div>
                  </div>
                  <button
                    className={cn(styles.btn, styles.btnMerge)}
                    onClick={handleAutoResolve}
                    disabled={isResolving}
                  >
                    <GitMerge size={16} />
                    Auto-Merge
                  </button>
                </div>
              </div>

              {/* JSON View for Advanced Users */}
              <details className="mt-6 text-sm">
                <summary className="cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)] py-2">
                  View Raw Data
                </summary>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div>
                    <strong className="block mb-1 text-xs uppercase text-[var(--muted-foreground)]">Local:</strong>
                    <pre className="p-3 bg-[var(--muted)] rounded-lg text-xs overflow-x-auto max-h-40">
                      {JSON.stringify(selectedConflict.localData, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <strong className="block mb-1 text-xs uppercase text-[var(--muted-foreground)]">Remote:</strong>
                    <pre className="p-3 bg-[var(--muted)] rounded-lg text-xs overflow-x-auto max-h-40">
                      {JSON.stringify(selectedConflict.remoteData, null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
            </div>

            <div className={styles.footer}>
              <div className="text-sm text-[var(--muted-foreground)]">
                Conflict {conflicts.indexOf(selectedConflict) + 1} of {conflicts.length}
              </div>
              <button className={cn(styles.btn, styles.btnText)} onClick={handleIgnore}>
                Skip for Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
