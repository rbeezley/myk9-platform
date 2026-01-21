import React from 'react';
import { AlertTriangle, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import './shared-dialog.css';

/** Tailwind styles for MaxTimeWarningDialog */
const styles = {
  dialog: cn(
    "max-w-full m-[var(--token-space-md)] max-h-[95vh]",
    "sm:max-w-[500px] sm:m-0 sm:max-h-none"
  ),
  header: cn(
    "bg-[var(--status-setup)]",
    "border-b-[var(--status-setup)]",
    "dark:bg-[var(--token-warning-contrast)] dark:border-b-[var(--status-setup)]"
  ),
  warningIcon: cn(
    "text-[var(--token-warning-contrast)]",
    "dark:text-[var(--primary)]"
  ),
  content: cn(
    "flex flex-col items-center text-center",
    "gap-[var(--token-space-xl)] sm:gap-[var(--token-space-3xl)]",
    "p-[var(--token-space-3xl)] sm:p-[var(--token-space-4xl)]",
    "px-[var(--token-space-xl)] sm:px-[var(--token-space-xl)]"
  ),
  iconLarge: cn(
    "flex items-center justify-center",
    "w-16 h-16 sm:w-20 sm:h-20",
    "bg-[var(--status-setup)] border-[3px] border-amber-100 rounded-full",
    "text-[var(--token-warning-contrast)]",
    "dark:bg-[var(--token-warning-contrast)] dark:border-[var(--status-setup)] dark:text-[var(--primary)]"
  ),
  title: cn(
    "text-2xl sm:text-xl font-bold m-0 mb-[var(--token-space-md)]",
    "text-[var(--token-warning-contrast)]",
    "dark:text-[var(--primary)]"
  ),
  classInfo: cn(
    "text-lg sm:text-base font-semibold m-0 mb-[var(--token-space-xl)]",
    "text-[var(--foreground)]",
    "dark:text-[var(--muted)]"
  ),
  warningText: cn(
    "leading-relaxed m-0 max-w-[400px]",
    "text-[var(--token-text-tertiary)]",
    "dark:text-[var(--border)]"
  ),
  actions: cn(
    "flex flex-col gap-[var(--token-space-xl)] sm:gap-[var(--token-space-lg)]",
    "px-0 sm:px-[var(--token-space-xl)]",
    "pb-[var(--token-space-3xl)] sm:pb-[var(--token-space-xl)]"
  ),
  actionBtn: cn(
    "flex items-center justify-center gap-[var(--token-space-md)]",
    "py-[var(--token-space-xl)] sm:py-3.5 px-[var(--token-space-3xl)] sm:px-[var(--token-space-2xl)]",
    "rounded-[var(--token-space-lg)]",
    "font-semibold text-base sm:text-[0.9375rem]",
    "cursor-pointer transition-all duration-200",
    "border-none min-h-12"
  ),
  primaryAction: cn(
    "bg-[var(--primary)] text-white",
    "shadow-[0_var(--token-space-sm)_var(--token-space-lg)_rgba(99,102,241,0.3)]",
    "hover:bg-[#5855eb] hover:-translate-y-px",
    "hover:shadow-[0_6px_var(--token-space-xl)_rgba(99,102,241,0.4)]",
    "active:translate-y-0 active:shadow-[0_var(--token-space-xs)_var(--token-space-md)_rgba(99,102,241,0.3)]"
  ),
  secondaryAction: cn(
    "bg-[var(--input)] text-[var(--token-text-tertiary)]",
    "border border-[var(--border)]",
    "hover:bg-[var(--border)] hover:text-[var(--token-text-secondary)] hover:border-[var(--border)]",
    "active:bg-[var(--border)]",
    "dark:bg-[var(--card)] dark:text-[var(--border)] dark:border-[var(--muted-foreground)]",
    "dark:hover:bg-[var(--muted-foreground)] dark:hover:text-[var(--muted)] dark:hover:border-[var(--token-text-tertiary)]"
  ),
  buttonIcon: "w-5 h-5",
};

interface MaxTimeWarningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSetMaxTime: () => void;
  onContinueAnyway: () => void;
  classData: {
    element: string;
    level: string;
    class_name: string;
  };
}

export const MaxTimeWarningDialog: React.FC<MaxTimeWarningDialogProps> = ({
  isOpen,
  onClose,
  onSetMaxTime,
  onContinueAnyway,
  classData
}) => {
  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className={cn("dialog-container", styles.dialog)} onClick={(e) => e.stopPropagation()}>
        <div className={cn("dialog-header", styles.header)}>
          <div className="dialog-title">
            <AlertTriangle className={cn("title-icon", styles.warningIcon)} />
            <span>Max Time Not Set</span>
          </div>
          <button className="close-button" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="dialog-content">
          <div className={styles.content}>
            <div className={styles.iconLarge}>
              <Clock className="h-12 w-12" />
            </div>

            <div>
              <h3 className={styles.title}>Max time has not been set for this class</h3>
              <p className={styles.classInfo}>
                <strong>{classData.element} {classData.level}</strong>
              </p>
              <p className={styles.warningText}>
                Judges typically need to set max times before starting to score entries.
                This ensures consistent timing for all competitors.
              </p>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              className={cn(styles.actionBtn, styles.primaryAction)}
              onClick={onSetMaxTime}
            >
              <Clock className={styles.buttonIcon} />
              Set Max Time Now
            </button>

            <button
              className={cn(styles.actionBtn, styles.secondaryAction)}
              onClick={onContinueAnyway}
            >
              Continue Anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};