/**
 * NoEntriesDialog
 *
 * A lightweight popup shown when a user clicks on a class that has no entries.
 * Better UX than navigating to a full page just to show "no entries".
 */

import React from 'react';
import { Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Tailwind styles for NoEntriesDialog */
const styles = {
  overlay: cn(
    "fixed inset-0 z-[9999] p-4",
    "flex items-center justify-center",
    "bg-black/60",
    "animate-[noEntriesFadeIn_0.15s_ease-out]"
  ),
  overlayLight: "bg-black/40",
  dialog: cn(
    "relative w-full max-w-[320px]",
    "bg-[var(--token-bg-primary,#1a1d23)] rounded-2xl",
    "border border-[var(--token-border,#3a3f47)]",
    "p-8 pb-6 text-center",
    "animate-[noEntriesSlideUp_0.2s_ease-out]"
  ),
  dialogLight: cn(
    "bg-[var(--token-bg-primary,#ffffff)]",
    "border-[var(--token-border,#e2e8f0)]"
  ),
  closeBtn: cn(
    "absolute top-3 right-3 z-10",
    "p-2 rounded-md",
    "bg-transparent border-none cursor-pointer",
    "text-[var(--token-text-tertiary,#64748b)]",
    "transition-all duration-150",
    "flex items-center justify-center",
    "hover:bg-[var(--token-bg-secondary,#2a2f38)] hover:text-[var(--token-text-secondary,#94a3b8)]",
    "active:scale-95"
  ),
  closeBtnLight: cn(
    "hover:bg-[var(--token-bg-secondary,#f1f5f9)]",
    "hover:text-[var(--token-text-primary,#1e293b)]"
  ),
  icon: cn(
    "flex justify-center mb-4",
    "text-[var(--token-text-tertiary,#64748b)] opacity-70",
    "[&_svg]:w-10 [&_svg]:h-10"
  ),
  title: cn(
    "text-xl font-semibold tracking-tight text-center",
    "text-[var(--token-text-primary,#f1f5f9)]",
    "m-0 mb-2"
  ),
  className: cn(
    "text-[0.9375rem] font-medium leading-relaxed",
    "text-[var(--primary,#14b8a6)]",
    "m-0 mb-4",
    "break-words hyphens-auto"
  ),
  message: cn(
    "text-sm leading-relaxed",
    "text-[var(--token-text-secondary,#94a3b8)]",
    "m-0 mb-6"
  ),
  actions: "flex justify-center",
  button: cn(
    "min-w-[100px] px-6 py-2.5",
    "text-[0.9375rem] font-medium",
    "rounded-[10px] border-none cursor-pointer",
    "bg-[var(--primary,#14b8a6)] text-white",
    "transition-all duration-150",
    "hover:bg-[var(--primary-hover,#0d9488)]",
    "active:scale-[0.98]"
  ),
};

interface NoEntriesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string; // The class name to display
}

export const NoEntriesDialog: React.FC<NoEntriesDialogProps> = ({
  isOpen,
  onClose,
  className,
}) => {
  if (!isOpen) return null;

  // Check if light theme
  const isLight = document.documentElement.classList.contains('theme-light');

  return (
    <div
      className={cn(styles.overlay, isLight && styles.overlayLight)}
      onClick={onClose}
    >
      <div
        className={cn(styles.dialog, isLight && styles.dialogLight)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="no-entries-title"
      >
        {/* Close button */}
        <button
          type="button"
          className={cn(styles.closeBtn, isLight && styles.closeBtnLight)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Icon - simple, no gradient background */}
        <div className={styles.icon}>
          <Users size={40} />
        </div>

        {/* Title with proper wrapping */}
        <h2 id="no-entries-title" className={styles.title}>
          No Entries Yet
        </h2>

        {/* Class name as subtitle */}
        {className && (
          <p className={styles.className}>{className}</p>
        )}

        {/* Message */}
        <p className={styles.message}>
          This class doesn't have any entries yet.
          Entries will appear once they are registered.
        </p>

        {/* Single dismiss button */}
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={onClose}>
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
