/**
 * Stored-time display rule: integer centiseconds, so 61.23 reads 1:01.23 and a
 * rounded-up hundredth carries (MYK9-1225). The implementation lives in
 * @myk9/core (the lower layer); the app imports it from here.
 */
export {
  splitSecondsToCentis,
  splitMsToCentis,
  formatSecondsAsMSSCC,
  formatMsAsMSSCC,
  type TimeParts,
} from '@myk9/core';
