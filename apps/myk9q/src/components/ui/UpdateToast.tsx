import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Tailwind styles for UpdateToast */
const styles = {
  overlay: cn(
    "fixed bottom-0 left-0 right-0 z-[9999]",
    "p-[var(--token-space-md)] pb-[calc(var(--token-space-md)+env(safe-area-inset-bottom,0px))]",
    "pointer-events-none"
  ),
  toast: cn(
    "flex items-center gap-[var(--token-space-md)]",
    "max-w-[500px] mx-auto",
    "px-[var(--token-space-lg)] py-[var(--token-space-md)]",
    "bg-[var(--card)] rounded-[var(--token-radius-lg)]",
    "border-l-4 border-l-[var(--primary)]",
    "shadow-lg dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]",
    "pointer-events-auto",
    "animate-[slideUp_0.3s_ease-out]",
    "motion-reduce:animate-none"
  ),
  icon: cn(
    "flex-shrink-0 flex items-center justify-center",
    "w-10 h-10 rounded-[var(--token-radius-md)]",
    "bg-[color-mix(in_srgb,var(--primary)_15%,transparent)]",
    "text-[var(--primary)]"
  ),
  content: "flex-1 min-w-0",
  message: cn(
    "m-0 text-[0.9375rem] font-medium leading-[1.4]",
    "text-[var(--foreground)]"
  ),
  actions: cn(
    "flex flex-col gap-[var(--token-space-xs)] flex-shrink-0",
    "min-[400px]:flex-row"
  ),
  btn: cn(
    "px-[var(--token-space-md)] py-[var(--token-space-sm)]",
    "rounded-[var(--token-radius-md)]",
    "text-sm font-semibold cursor-pointer whitespace-nowrap",
    "transition-[background-color,opacity] duration-150",
    "focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-2"
  ),
  btnPrimary: cn(
    "bg-[var(--primary)] text-white border-none",
    "hover:opacity-90 active:opacity-80"
  ),
  btnSecondary: cn(
    "bg-transparent text-[var(--muted-foreground)]",
    "border border-[var(--border)]",
    "hover:bg-[var(--muted)] active:bg-[var(--border)]",
    "dark:hover:bg-white/10"
  ),
};

interface UpdateToastProps {
  /** Called when user taps "Update Now" */
  onUpdate: () => void;
  /** Called when user taps "Later" */
  onLater: () => void;
}

/**
 * PWA Update Toast
 *
 * Displays a styled notification when a new app version is available.
 * Replaces the browser's native confirm() dialog with a branded experience.
 *
 * Features:
 * - Fixed position at bottom of screen
 * - Teal accent to match app branding
 * - "Update Now" and "Later" buttons
 * - Accessible with proper ARIA attributes
 */
export function UpdateToast({ onUpdate, onLater }: UpdateToastProps) {
  return (
    <div
      className={styles.overlay}
      role="alertdialog"
      aria-labelledby="update-toast-message"
      aria-describedby="update-toast-message"
    >
      <div className={styles.toast}>
        <div className={styles.icon}>
          <RefreshCw size={24} />
        </div>

        <div className={styles.content}>
          <p id="update-toast-message" className={styles.message}>
            myK9Q has been updated! Tap to load new features.
          </p>
        </div>

        <div className={styles.actions}>
          <button
            className={cn(styles.btn, styles.btnPrimary)}
            onClick={onUpdate}
          >
            Update Now
          </button>
          <button
            className={cn(styles.btn, styles.btnSecondary)}
            onClick={onLater}
            autoFocus
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpdateToast;
