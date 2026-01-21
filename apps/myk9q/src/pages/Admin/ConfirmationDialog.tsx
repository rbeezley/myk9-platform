/**
 * Custom Confirmation Dialog Component
 *
 * Beautiful modal dialog for confirming admin actions
 */

import React from 'react';
import { cn } from '@/lib/utils';

/** Tailwind styles for ConfirmationDialog */
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
    "animate-in slide-in-from-top-5 zoom-in-95 duration-300"
  ),
  typeWarning: "border-t-[6px] border-t-amber-100",
  typeSuccess: "border-t-[6px] border-t-emerald-500",
  typeDanger: "border-t-[6px] border-t-red-500",
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
  actions: cn(
    "flex flex-col sm:flex-row gap-4",
    "px-6 py-4 pb-6 sm:px-8 sm:py-6 sm:pb-8",
    "bg-[var(--muted)] justify-end"
  ),
  btn: cn(
    "px-8 py-3 rounded-lg text-base font-semibold",
    "cursor-pointer transition-all duration-200",
    "min-w-[100px] w-full sm:w-auto"
  ),
  btnCancel: cn(
    "bg-[var(--card)] text-[var(--foreground)]",
    "border border-[var(--border)]",
    "hover:bg-[var(--muted)] hover:border-[var(--muted-foreground)]"
  ),
  btnConfirm: cn(
    "text-[var(--primary-foreground)]",
    "shadow-md hover:-translate-y-0.5 hover:shadow-lg"
  ),
  btnWarning: "bg-gradient-to-br from-amber-100 to-amber-600",
  btnSuccess: "bg-gradient-to-br from-teal-500 to-teal-600 hover:shadow-teal-500/40",
  btnDanger: "bg-gradient-to-br from-red-500 to-red-600 hover:shadow-red-500/40",
};

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  type?: 'success' | 'warning' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  details?: string[];
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  cancelText = 'Cancel',
  type = 'warning',
  onConfirm,
  onCancel,
  details
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅';
      case 'danger':
        return '🚨';
      case 'warning':
      default:
        return '⚠️';
    }
  };

  const getTypeStyle = () => {
    switch (type) {
      case 'success':
        return styles.typeSuccess;
      case 'danger':
        return styles.typeDanger;
      case 'warning':
      default:
        return styles.typeWarning;
    }
  };

  const getBtnStyle = () => {
    switch (type) {
      case 'success':
        return styles.btnSuccess;
      case 'danger':
        return styles.btnDanger;
      case 'warning':
      default:
        return styles.btnWarning;
    }
  };

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={cn(styles.container, getTypeStyle())} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.icon}>{getIcon()}</div>
          <h3 className={styles.title}>{title}</h3>
        </div>

        <div className={styles.content}>
          <p className={styles.message}>{message}</p>

          {details && details.length > 0 && (
            <div className={styles.details}>
              <h4 className={styles.detailsTitle}>Classes affected:</h4>
              <ul className={styles.detailsList}>
                {details.map((detail, index) => (
                  <li key={index} className={styles.detailsItem}>{detail}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button
            onClick={onCancel}
            className={cn(styles.btn, styles.btnCancel)}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={cn(styles.btn, styles.btnConfirm, getBtnStyle())}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};