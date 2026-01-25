/**
 * Success Dialog Component
 *
 * Beautiful modal dialog for showing success messages
 */

import React from 'react';
import { cn } from '@/lib/utils';

/** Tailwind styles for SuccessDialog (matching ConfirmationDialog) */
const styles = {
  overlay: cn(
    "fixed inset-0 bg-black/60 backdrop-blur-sm",
    "flex items-center justify-center z-[1000]",
    "animate-in fade-in duration-200"
  ),
  container: cn(
    "bg-[var(--card)] rounded-xl shadow-2xl",
    "w-[calc(100%-2rem)] max-w-[500px] mx-4 max-h-[80vh]",
    "sm:w-[90%] sm:mx-0",
    "overflow-hidden relative border border-[var(--border)]",
    "animate-in slide-in-from-top-5 zoom-in-95 duration-300",
    "border-t-[6px] border-t-emerald-500"
  ),
  header: cn(
    "flex items-center gap-4",
    "px-6 pt-6 pb-4 sm:px-8 sm:pt-8",
    "border-b border-[var(--border)]"
  ),
  icon: "text-[2rem] sm:text-[2.5rem] leading-none",
  title: cn(
    "m-0 text-xl sm:text-2xl font-bold",
    "text-[var(--foreground)] flex-1"
  ),
  content: "px-6 py-4 sm:px-8 sm:py-6",
  message: cn(
    "m-0 mb-4 text-lg text-[var(--foreground)]",
    "leading-relaxed"
  ),
  details: cn(
    "bg-[var(--muted)] border-2 border-[var(--border)]",
    "rounded-lg p-5 mt-4"
  ),
  detailsTitle: cn(
    "m-0 mb-3 text-sm font-semibold uppercase tracking-wider",
    "text-[var(--foreground)]"
  ),
  detailsList: "m-0 p-0 list-none",
  detailsItem: cn(
    "py-2 text-[var(--foreground)] font-medium",
    "relative pl-6",
    "before:content-['•'] before:absolute before:left-0",
    "before:text-[var(--primary)] before:font-bold before:text-lg"
  ),
  successNote: cn(
    "mt-4 p-4 rounded-lg",
    "bg-emerald-500/10 border border-emerald-500/20",
    "text-[var(--foreground)] text-sm"
  ),
  actions: cn(
    "flex flex-col sm:flex-row gap-4",
    "px-6 py-4 pb-6 sm:px-8 sm:py-6 sm:pb-8",
    "bg-[var(--muted)] justify-end"
  ),
  btn: cn(
    "px-8 py-3 rounded-lg text-base font-semibold",
    "cursor-pointer transition-all duration-200",
    "min-w-[100px] w-full sm:w-auto",
    "text-[var(--primary-foreground)]",
    "bg-gradient-to-br from-teal-500 to-teal-600",
    "shadow-md hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-500/40"
  ),
};

interface SuccessDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
  details?: string[];
}

export const SuccessDialog: React.FC<SuccessDialogProps> = ({
  isOpen,
  title,
  message,
  onClose,
  details
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.container} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.icon}>🎉</div>
          <h3 className={styles.title}>{title}</h3>
        </div>

        <div className={styles.content}>
          <p className={styles.message}>{message}</p>

          {details && details.length > 0 && (
            <div className={styles.details}>
              <h4 className={styles.detailsTitle}>Changes applied to:</h4>
              <ul className={styles.detailsList}>
                {details.map((detail, index) => (
                  <li key={index} className={styles.detailsItem}>{detail}</li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.successNote}>
            <strong>💡 Note:</strong> Changes are now live on the Run Order Display
          </div>
        </div>

        <div className={styles.actions}>
          <button
            onClick={onClose}
            className={styles.btn}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
};
