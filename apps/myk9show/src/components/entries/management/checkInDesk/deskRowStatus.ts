import type { CheckInStatus } from '@myk9/core';
import type { useCheckInDeskActions } from './useCheckInDeskActions';
import type { DeskPullRow, useDeskPull } from './useDeskPull';

/**
 * One class row's status change, the same on the Check-in desk and the Show Desk class table:
 * Pulled is the real Pull, so it asks first (MYK9-1749); every other status is a plain write.
 */
export function changeDeskRowStatus(
  row: DeskPullRow,
  status: CheckInStatus,
  actions: Pick<ReturnType<typeof useCheckInDeskActions>, 'setStatus'>,
  pull: Pick<ReturnType<typeof useDeskPull>, 'requestPull'>
): void {
  if (status === 'pulled') pull.requestPull(row);
  else void actions.setStatus(`${row.dogName}, ${row.className}`, [row.entryId], status);
}
