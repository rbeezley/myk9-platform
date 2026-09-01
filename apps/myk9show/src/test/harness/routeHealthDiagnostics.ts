export type RouteHealthLog = (message: string) => void;

export function logUnsettledAppApiRequests(
  routeId: string,
  pendingUrls: string[],
  log: RouteHealthLog = message => console.log(message)
): string {
  const diagnostic = pendingUrls.length > 0 ? JSON.stringify(pendingUrls) : 'idle-window-incomplete';
  log(`[route-health] ${routeId}: unsettled app API requests: ${diagnostic}`);
  return diagnostic;
}
