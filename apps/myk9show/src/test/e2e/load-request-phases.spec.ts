import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { signInAsSecretary, TEST_USERS } from './helpers/testUsers';
import { loadEntryFixture, LOAD_SHOW_ID } from '../load/loadFixture';
import {
  installSharedStagingWriteGuard,
  summarizeSharedStagingWriteLedger,
  type SharedStagingWriteLedgerEntry,
} from './helpers/sharedStagingWriteGuard';

// Bounded diagnostic, never a load scenario or a scoring-write test.
test.skip(process.env.LOAD_READINESS_DIAGNOSTIC !== 'true', 'Explicit diagnostic opt-in required');
test.use({ trace: 'off', screenshot: 'off', video: 'off', serviceWorkers: 'block' });
test.setTimeout(60_000);

interface InitiatorStack {
  callFrames: Array<{ functionName: string; url: string; lineNumber: number }>;
  parent?: InitiatorStack;
}

interface RequestSample {
  phase: string;
  endpoint: string;
  method: string;
  fingerprint: string;
  initiators: string[];
  startedAt: number;
  durationMs?: number;
  status?: number;
  failed?: boolean;
}

function safeInitiators(stack?: InitiatorStack): string[] {
  const frames: string[] = [];
  for (let depth = 0; stack && depth < 4; depth++, stack = stack.parent) {
    for (const frame of stack.callFrames) {
      if (!frame.url.startsWith('http')) continue;
      const path = new URL(frame.url).pathname;
      frames.push(`${frame.functionName || '(anonymous)'} ${path}:${frame.lineNumber + 1}`);
    }
  }
  return frames.slice(0, 20);
}

test('G9 request attribution separates startup and cached navigation', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(browserName !== 'chromium', 'CDP request attribution requires Chromium');
  expect(TEST_USERS.SECRETARY.email).toBe('secretary@myk9t.com');
  const ledger: SharedStagingWriteLedgerEntry[] = [];
  await installSharedStagingWriteGuard(page, { strictRpcWrites: true, ledger });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  await cdp.send('Debugger.enable');
  await cdp.send('Debugger.setAsyncCallStackDepth', { maxDepth: 16 });
  const requests = new Map<string, RequestSample>();
  let phase = 'cold-sign-in';
  const frontendRequests = new Map<string, { phase: string; type: string; bytes?: number }>();
  const phases: Array<{
    name: string;
    durationMs: number;
    rendererCounters: Record<string, number>;
  }> = [];
  cdp.on('Network.requestWillBeSent', event => {
    const url = new URL(event.request.url);
    if (url.origin === new URL(String(testInfo.project.use.baseURL)).origin) {
      frontendRequests.set(event.requestId, { phase, type: event.type ?? 'Other' });
    }
    if (!url.pathname.startsWith('/rest/v1/') || event.request.method === 'OPTIONS') return;
    // Only a digest leaves this callback: no filter values, body, tokens or headers.
    const fingerprint = createHash('sha256')
      .update(
        `${event.request.method}:${url.pathname}${url.search}:${event.request.postData ?? ''}`
      )
      .digest('hex')
      .slice(0, 16);
    requests.set(event.requestId, {
      phase,
      endpoint: url.pathname,
      method: event.request.method,
      fingerprint,
      initiators: safeInitiators(event.initiator.stack),
      startedAt: event.timestamp,
    });
  });
  cdp.on('Network.responseReceived', event => {
    const request = requests.get(event.requestId);
    if (request) request.status = event.response.status;
  });
  cdp.on('Network.loadingFinished', event => {
    const frontend = frontendRequests.get(event.requestId);
    if (frontend) frontend.bytes = event.encodedDataLength;
    const request = requests.get(event.requestId);
    if (request) request.durationMs = Math.round((event.timestamp - request.startedAt) * 1000);
  });
  cdp.on('Network.loadingFailed', event => {
    const request = requests.get(event.requestId);
    if (request) request.failed = true;
  });
  async function measure(name: string, action: () => Promise<unknown>) {
    phase = name;
    const started = performance.now();
    try {
      await action();
    } finally {
      const durationMs = Math.round(performance.now() - started);
      // Raw cumulative counters for the current document, in seconds (except heap
      // bytes). Document navigation resets them: do not subtract across documents
      // or label renderer task time as whole-browser/host CPU utilization.
      const { metrics } = await cdp.send('Performance.getMetrics');
      const names = new Set([
        'TaskDuration',
        'ScriptDuration',
        'LayoutDuration',
        'RecalcStyleDuration',
        'JSHeapUsedSize',
      ]);
      phases.push({
        name,
        durationMs,
        rendererCounters: Object.fromEntries(
          metrics
            .filter(metric => names.has(metric.name))
            .map(metric => [metric.name, metric.value])
        ),
      });
    }
  }
  const sheetPath = (entryNumber: number) => {
    const fixture = loadEntryFixture(entryNumber);
    return `/at-show/${LOAD_SHOW_ID}/class/${fixture.classId}/score/${fixture.entryId}`;
  };
  try {
    await measure('cold-sign-in', () => signInAsSecretary(page, '/shows'));
    await measure('startup-background-3s', () => page.waitForTimeout(3000));
    await measure('first-sheet-document-navigation', async () => {
      await page.goto(sheetPath(2), { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('submit-btn')).toBeVisible({ timeout: 20_000 });
    });
    await measure('first-sheet-background-3s', () => page.waitForTimeout(3000));
    await measure('next-cached-sheet-client-navigation', async () => {
      // Exercise BrowserRouter navigation without submitting a score or reloading
      // the document. Entries 2 and 10 are successive dogs in the same class.
      await page.evaluate(path => {
        window.history.pushState(null, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, sheetPath(10));
      await expect(page.getByTestId('submit-btn')).toBeVisible({ timeout: 5_000 });
      await expect(page).toHaveURL(new RegExp(`${loadEntryFixture(10).entryId}$`));
      await expect(page.getByText('2002', { exact: true }).first()).toBeVisible();
    });
    await measure('next-sheet-background-3s', () => page.waitForTimeout(3000));
    await measure('cached-sheet-document-navigation', async () => {
      await page.goto(sheetPath(10), { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('submit-btn')).toBeVisible({ timeout: 5_000 });
    });
    await measure('document-background-3s', () => page.waitForTimeout(3000));
    // Analytics is an ambient write: keep it BLOCKED and recorded, never allow
    // it through merely to make the diagnostic pass.
    expect(
      ledger.filter(
        item => item.disposition === 'blocked' && item.path !== '/rest/v1/analytics_events'
      )
    ).toEqual([]);
  } finally {
    const samples = [...requests.values()];
    const summaries = phases.map(window => {
      const own = samples.filter(sample => sample.phase === window.name);
      const frontend = [...frontendRequests.values()].filter(
        sample => sample.phase === window.name
      );
      const byEndpoint = new Map<string, number>();
      for (const request of own) {
        byEndpoint.set(request.endpoint, (byEndpoint.get(request.endpoint) ?? 0) + 1);
      }
      return {
        ...window,
        frontend: {
          requests: frontend.length,
          scripts: frontend.filter(sample => sample.type === 'Script').length,
          completedRequests: frontend.filter(sample => sample.bytes !== undefined).length,
          encodedBytes: frontend.reduce((total, sample) => total + (sample.bytes ?? 0), 0),
        },
        requests: own.length,
        repeatedExactRequests: own.length - new Set(own.map(request => request.fingerprint)).size,
        endpoints: Object.fromEntries([...byEndpoint].sort((a, b) => b[1] - a[1])),
      };
    });
    const evidence = {
      baseURL: testInfo.project.use.baseURL,
      serviceWorkers: 'blocked',
      writeLedger: ledger,
      phases: summaries,
      requests: samples,
    };
    console.info(
      JSON.stringify({ phases: summaries, writes: summarizeSharedStagingWriteLedger(ledger) })
    );
    const evidencePath = testInfo.outputPath('request-phases.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
    await testInfo.attach('request-phases.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
    await cdp.detach();
  }
});
