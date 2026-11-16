import type { ElementTimerReturn } from '../../../types';

/**
 * Correcting a saved score reopens the sheet with the element clock at zero.
 * Unless the judge ran it again, the saved element time stands (MYK9-2068), so a
 * correction never writes 0:00.00 over it.
 */
export function savedElementTimeFor(
  elementTimer: Pick<ElementTimerReturn, 'getTimeMs' | 'isRunning' | 'formatTime'>,
  savedElementTime: string | undefined
): { keepSaved: string | undefined; text: () => string | undefined } {
  const clockUnused = elementTimer.getTimeMs() === 0 && !elementTimer.isRunning;
  const keepSaved = clockUnused && savedElementTime ? savedElementTime : undefined;
  return {
    keepSaved,
    // A clock that never ran has no element time: undefined, not "0:00.00" (stored as null).
    text: () => {
      const ms = elementTimer.getTimeMs();
      return keepSaved ?? (ms > 0 ? elementTimer.formatTime(ms) : undefined);
    },
  };
}
