import type { ReportDataState } from '@/hooks/queries/useReportData';

export function emergencyPacketReadinessCopy(
  dataState: ReportDataState,
  hasCompleteRows = true,
  registrationsReadComplete = true
): string | undefined {
  if (!registrationsReadComplete) {
    return 'Registration details are unavailable. Reconnect before preparing the packet.';
  }
  if (!hasCompleteRows) {
    return 'The complete packet data is unavailable. Reload Show Desk before preparing the packet.';
  }
  switch (dataState) {
    case 'loading':
      return 'Checking the complete show data before preparing the packet.';
    case 'unavailable':
      return 'Reconnect before preparing the packet so no classes or entries are missing.';
    case 'stale':
      return 'Still loading the complete show data. Prepare the packet when this finishes.';
    case 'error':
      return 'The complete show data could not be loaded. Reload Show Desk before preparing the packet.';
    case 'ready':
      return undefined;
  }
}
