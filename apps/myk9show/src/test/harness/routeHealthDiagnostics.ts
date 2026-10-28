export type RouteHealthLog = (message: string) => void;

export function logUnsettledAppApiRequests(
  routeId: string,
  pendingUrls: string[],
  log: RouteHealthLog = message => console.log(message),
  pendingLedger: string[] = []
): string {
  const diagnostic =
    pendingUrls.length > 0 ? JSON.stringify(pendingUrls) : 'idle-window-incomplete';
  log(`[route-health] ${routeId}: unsettled app API requests: ${diagnostic}`);
  // MYK9-1467: says whether the page still awaits each one or never fetched it.
  if (pendingLedger.length > 0) {
    log(`[route-health] ${routeId}: page fetch ledger: ${JSON.stringify(pendingLedger)}`);
  }
  return diagnostic;
}
