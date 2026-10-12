import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { friendlySaveError } from '@/utils/friendlySaveError';
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
