import type { CDPSession } from '@playwright/test';
import { benchmarkRequestDisposition } from './benchmarkNetworkPolicy';
import { summarizeNetworkTransfers, type ObservedRequest } from './browserMetrics';

/** Observe actual page-target transfers without altering the read-only request guard. */
export function observeNetwork(cdp: CDPSession, supabaseUrl: string | undefined) {
  const requests = new Map<string, ObservedRequest>();
  let serviceWorkerScripts = 0;
  cdp.on('Network.requestWillBeSent', event => {
    requests.set(event.requestId, {
      url: event.request.url,
      bytes: 0,
      cached: false,
      handledLocally:
        benchmarkRequestDisposition(event.request.method, event.request.url, supabaseUrl) !==
        'continue',
    });
  });
  cdp.on('Network.responseReceived', event => {
    const request = requests.get(event.requestId);
    if (request) {
      request.cached = !!event.response.fromDiskCache || !!event.response.fromServiceWorker;
      if (event.response.fromServiceWorker && new URL(request.url).pathname.endsWith('.js')) {
        serviceWorkerScripts += 1;
      }
    }
  });
  cdp.on('Network.requestServedFromCache', event => {
    const request = requests.get(event.requestId);
    if (request) request.cached = true;
  });
  cdp.on('Network.loadingFinished', event => {
    const request = requests.get(event.requestId);
    if (request) request.bytes = event.encodedDataLength;
  });
  return () => ({
    ...summarizeNetworkTransfers([...requests.values()]),
    serviceWorkerScripts,
  });
}
