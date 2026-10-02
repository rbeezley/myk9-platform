/**
 * Thrown from an `EditPanelWrapper` `onSave` when the panel has already put the
 * reason on screen itself (for example the duplicate-dog card). The wrapper keeps
 * the form open exactly as for any failed save, but raises no failure toast, so
 * a calm prompt is not followed by an alarming "couldn't save".
 */
export class PanelSaveHandledError extends Error {
  constructor(message = 'The panel is already showing why this was not saved.') {
    super(message);
    this.name = 'PanelSaveHandledError';
  }
}

/** The toast text a successful save shows: "‹Name› saved" after an edit. */
export function savedMessage(name: string | undefined | null, fallback = 'Changes'): string {
  return `${name?.trim() || fallback} saved`;
}

/** The toast text a successful create shows: "‹Name› added". */
export function addedMessage(name: string | undefined | null, fallback = 'Item'): string {
  return `${name?.trim() || fallback} added`;
}

/**
 * A save made while offline is written to this device and queued, so "saved"
 * alone would overstate it. Says where it landed and that it will sync.
 */
export function offlineAwareMessage(message: string): string {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return message;
  return message.replace(
    / (saved|added)$/,
    " $1 on this device — it will sync when you're back online"
  );
}
