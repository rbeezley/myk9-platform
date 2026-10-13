import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { friendlySaveError, friendlySaveMessage } from '@/utils/friendlySaveError';
import { PanelSaveHandledError, offlineAwareMessage } from './panelSaveErrors';

/**
 * One report for both of EditPanelWrapper's save paths. A failed save keeps the
 * form open and says so in friendly words; the raw error text goes to the log
 * only (H1).
 */
export function reportPanelSaveFailure(error: unknown): void {
  // A handled refusal is a UX path the panel already explained, not an error.
  if (error instanceof PanelSaveHandledError) return;
  logger.error('Save failed:', 'components', {}, error as Error);
  const { title, description } = friendlySaveError(error);
  notifications.error(title, { description });
}

/** The success toast, when the panel has one: "‹Name› saved" / "‹Name› added". */
export function announcePanelSaved<T>(
  successMessage: string | ((data: T) => string) | undefined,
  saved: T
): void {
  if (successMessage === undefined) return;
  notifications.success(
    offlineAwareMessage(
      typeof successMessage === 'function' ? successMessage(saved) : successMessage
    )
  );
}

/**
 * A save the person left the panel on finished (MYK9-1125). The panel's own
 * success message when it has one, else one that names the panel.
 */
export function announceDetachedSaveSettled<T>(
  successMessage: string | ((data: T) => string) | undefined,
  saved: T,
  panelTitle: string
): void {
  if (successMessage !== undefined) {
    announcePanelSaved(successMessage, saved);
    return;
  }
  notifications.success(`${panelTitle}: changes saved`);
}

/**
 * A save the person left the panel on failed (MYK9-1125). The form is gone, so
 * the usual "Your changes are still here" would be false: say it was not saved.
 */
export function reportDetachedSaveFailure(error: unknown, panelTitle: string): void {
  logger.error('Save failed after leaving the panel:', 'components', {}, error as Error);
  notifications.error(`${panelTitle}: changes not saved`, {
    description: friendlySaveMessage(error),
  });
}
