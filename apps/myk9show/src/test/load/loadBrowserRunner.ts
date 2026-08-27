import { createClient } from '@supabase/supabase-js';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { signInAsExhibitor, signInAsSecretary } from '../e2e/helpers/testUsers';
import { assertApplicationTarget } from './loadAppTarget';
import { buildSessionAssignments, type LoadSessionAssignment } from './loadAssignments';
import type { LoadObservation } from './loadEvaluation';
import {
  loadEntryFixture,
  LOAD_CLASS_IDS,
  LOAD_SHOW_ENTRY_COUNT,
  LOAD_SHOW_ID,
} from './loadFixture';
import { startLoadGeneratorSampler, type LoadGeneratorSampler } from './loadGeneratorSampler';
import { LoadMetrics, type LoadMetricSamples } from './loadMetrics';
import {
  readPendingMutationCount,
  waitForQueueDrain,
  waitForReplicatedEntry,
  waitForReplicatedEntrySync,
} from './loadReplicationProbe';
import { startLoadPlatformSampler, type LoadPlatformSampler } from './loadPlatformSampler';
import { countPersistedScores } from './loadPersistence';
import type { LoadScenario } from './loadScenario';
import { LoadSessionLifecycle } from './loadSessionLifecycle';
import { scheduledStartDelayMs, selectShardAssignments, type LoadShard } from './loadShard';
import type { ResolvedLoadTarget } from './loadTarget';

const ENTRY_RESULT_REPLICA_VERSION_KEY = 'myk9:entry-result-replica-version';
const ENTRY_RESULT_REPLICA_VERSION = '20260620-authenticated-entry-results-view-v2';
const SESSION_PREPARATION_CONCURRENCY = 10;
const BROWSER_CONTEXT_CLOSE_TIMEOUT_MS = 2_000;
const CONTENTION_FIRST_SESSION = 50;
const CONTENTION_SESSION_COUNT = 5;
const CONTENTION_ENTRY_NUMBER = CONTENTION_FIRST_SESSION * LOAD_CLASS_IDS.length + 1;

interface RunOptions {
  smoke?: boolean;
  shard?: LoadShard;
}

interface SessionResult {
  scoredEntryIds: string[];
  maxQueueDepth: number;
}

export interface BrowserLoadResult {
  observation: LoadObservation;
  samples: LoadMetricSamples;
  assignmentSequences: readonly number[];
  startAtMs: number;
  startedAtMs: number;
  elapsedMs: number;
}

export async function runBrowserLoad(
  browser: Browser,
  scenario: LoadScenario,
  target: ResolvedLoadTarget,
  options: RunOptions = {}
): Promise<BrowserLoadResult> {
  await assertApplicationTarget(browser, target);
  await assertCanonicalFixture();
  const metrics = new LoadMetrics();
  const allAssignments = buildSessionAssignments(scenario, options.smoke === true);
  const assignments = options.shard
    ? selectShardAssignments(allAssignments, options.shard)
    : allAssignments;
  const contexts: BrowserContext[] = [];
  const scoredEntryIds = new Set<string>();
  let platformSampler: LoadPlatformSampler | undefined;
  let generatorSampler: LoadGeneratorSampler | undefined;
  let maxQueueDepth = 0;
  let finalQueueDepth = 0;
  let queueTelemetryFailures = 0;
  const lifecycle = new LoadSessionLifecycle(assignments);
  const durationMs = options.smoke ? 30_000 : scenario.durationMs;
  const rampUpMs = options.smoke ? 0 : scenario.rampUpMs;

  try {
    generatorSampler = await startLoadGeneratorSampler({
      browser,
      shardIndex: options.shard?.index ?? 0,
      expectedStartAtMs: options.shard?.startAtMs,
    });
    const secretaryState = await createAuthState(browser, target.baseUrl, 'secretary');
    const exhibitorState = await createAuthState(browser, target.baseUrl, 'exhibitor');
    const preparedSessions = await mapWithConcurrency(
      assignments,
      SESSION_PREPARATION_CONCURRENCY,
      async assignment => {
        const storageState = assignment.kind === 'exhibitor-read' ? exhibitorState : secretaryState;
        // The production bundle registers the PWA (main.tsx gates on !DEV), so each
        // fresh context would Workbox-precache the whole 41 MB manifest inside the
        // measurement window. Real devices pay that once and arrive warm; 100 cold
        // contexts would only measure the generator.
        const context = await browser.newContext({
          baseURL: target.baseUrl,
          storageState,
          serviceWorkers: 'block',
        });
        contexts.push(context);
        const page = await context.newPage();
        await metrics.attach(page);
        return { assignment, context, page };
      }
    );
    generatorSampler.markContextsPrepared();
    // Distributed runs sample the platform from a dedicated browser-free runner:
    // a shard that polls the database while driving 12-13 contexts saturates
    // itself, and its own saturation then invalidates the attribution.
    const collectPlatform = !options.smoke && !options.shard;
    platformSampler = collectPlatform
      ? await startLoadPlatformSampler(process.env, scenario.targets.databaseConnectionCap)
      : undefined;
    if (options.shard) await delay(scheduledStartDelayMs(options.shard));
    lifecycle.markPrepared(assertAllSessionsOpenAtStart(preparedSessions));
    generatorSampler.markLoadStarted();
    const startedAtMs = Date.now();
    const startAtMs = options.shard?.startAtMs ?? startedAtMs;
    const endsAt = startAtMs + durationMs;

    const sessionResults = await Promise.allSettled(
      preparedSessions.map(async ({ assignment, page }) => {
        const assignmentStartsAt =
          startAtMs + (assignment.sequence / allAssignments.length) * rampUpMs;
        const delayMs = Math.max(0, assignmentStartsAt - Date.now());
        if (delayMs > 0) await delay(delayMs);
        lifecycle.markStarted(assignment);

        try {
          const result = await runPrimaryWorkflow(
            page,
            assignment,
            metrics,
            endsAt,
            options.smoke === true,
            entryId => scoredEntryIds.add(entryId)
          );
          lifecycle.markCompleted(assignment);
          result.scoredEntryIds.forEach(entryId => scoredEntryIds.add(entryId));
          maxQueueDepth = Math.max(maxQueueDepth, result.maxQueueDepth);
          if (!options.smoke && assignment.kind !== 'ringside-scoring') {
            await delay(connectedSessionHoldMs(endsAt, Date.now()));
          }
        } catch (error) {
          if (options.smoke) throw error;
          lifecycle.markFailed(assignment);
          metrics.recordWorkflowFailure({
            workload: assignment.kind,
            route: pageRoute(page),
            error,
          });
        } finally {
          try {
            const queueDepth = await readPendingMutationCount(page);
            maxQueueDepth = Math.max(maxQueueDepth, queueDepth);
            await waitForQueueDrain(page);
            finalQueueDepth += await readPendingMutationCount(page);
          } catch {
            queueTelemetryFailures += 1;
          }
        }
      })
    );
    const rejectedSessions = sessionResults.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (options.smoke && rejectedSessions[0]) throw rejectedSessions[0].reason;

    // Reconciliation/teardown is not generator load. Stop at the workload boundary.
    const generator = await generatorSampler.stop();
    generatorSampler = undefined;
    await metrics.settle();
    const persistence = await countPersistedScores([...scoredEntryIds]);
    const platform = await platformSampler?.stop();
    platformSampler = undefined;
    const elapsedMs = Date.now() - startAtMs;
    const sessionLifecycle = lifecycle.observation();
    const observation = metrics.buildObservation({
      concurrentSessions: sessionLifecycle.preparedSessions,
      ringsideSessions: sessionLifecycle.preparedRingsideSessions,
      sessionLifecycle,
      generator,
      elapsedMs,
      maxReplicationQueueDepth: maxQueueDepth,
      finalReplicationQueueDepth: finalQueueDepth,
      queueTelemetryFailures,
      expectedPersistedScores: scoredEntryIds.size,
      persistedScores: persistence.count,
      persistenceFailures: persistence.failures,
      platform,
    });
    return {
      observation,
      samples: metrics.samples(),
      assignmentSequences: assignments.map(assignment => assignment.sequence),
      startAtMs,
      startedAtMs,
      elapsedMs,
    };
  } finally {
    await platformSampler?.stop().catch(() => undefined);
    await generatorSampler?.stop().catch(() => undefined);
    await closeBrowserContexts(contexts);
  }
}

export async function closeBrowserContexts(
  contexts: readonly Pick<BrowserContext, 'close'>[],
  timeoutMs = BROWSER_CONTEXT_CLOSE_TIMEOUT_MS
): Promise<void> {
  await Promise.all(
    contexts.map(async context => {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<void>(resolve => {
        timer = setTimeout(resolve, timeoutMs);
      });
      await Promise.race([
        Promise.resolve()
          .then(() => context.close())
          .catch(() => undefined),
        timeout,
      ]);
      if (timer) clearTimeout(timer);
    })
  );
}

export function assertAllSessionsOpenAtStart(
  sessions: readonly {
    assignment: LoadSessionAssignment;
    page: Pick<Page, 'isClosed'>;
  }[]
): LoadSessionAssignment[] {
  const openAssignments = sessions
    .filter(session => !session.page.isClosed())
    .map(session => session.assignment);
  const missing = sessions.length - openAssignments.length;
  if (missing > 0) {
    throw new Error(
      `${missing} prepared browser session${missing === 1 ? ' was' : 's were'} no longer open at synchronized start.`
    );
  }
  return openAssignments;
}

export async function mapWithConcurrency<T, TResult>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<TResult>
): Promise<TResult[]> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error('Concurrency must be a positive integer.');
  }

  const results = new Array<TResult>(values.length);
  let nextIndex = 0;
  let firstError: unknown;
  const worker = async () => {
    while (firstError === undefined) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      try {
        results[index] = await mapper(values[index], index);
      } catch (error) {
        firstError = error;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  if (firstError !== undefined) throw firstError;
  return results;
}

export function scoringEntryNumber(sessionIndex: number, classIndex: number): number {
  const isContentionSession =
    sessionIndex >= CONTENTION_FIRST_SESSION &&
    sessionIndex < CONTENTION_FIRST_SESSION + CONTENTION_SESSION_COUNT;
  if (isContentionSession) {
    if (classIndex === 0) return CONTENTION_ENTRY_NUMBER;
    return sessionIndex * LOAD_CLASS_IDS.length + classIndex + 1;
  }
  const rotatedClassIndex = (sessionIndex + classIndex) % LOAD_CLASS_IDS.length;
  return sessionIndex * LOAD_CLASS_IDS.length + rotatedClassIndex + 1;
}

export function connectedSessionHoldMs(endsAt: number, now: number): number {
  return Math.max(0, endsAt - now);
}

function pageRoute(page: Page): string {
  try {
    const url = new URL(page.url());
    return `${url.pathname}${url.search}`;
  } catch {
    return page.url();
  }
}

async function createAuthState(browser: Browser, baseURL: string, role: 'secretary' | 'exhibitor') {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    const warmFixture = loadEntryFixture(1);
    const warmPath = `/at-show/${LOAD_SHOW_ID}/class/${warmFixture.classId}`;
    if (role === 'secretary') await signInAsSecretary(page, '/shows');
    else await signInAsExhibitor(page, '/shows');
    await page.waitForFunction(
      ({ key, value }) => localStorage.getItem(key) === value,
      { key: ENTRY_RESULT_REPLICA_VERSION_KEY, value: ENTRY_RESULT_REPLICA_VERSION },
      { timeout: 90_000 }
    );
    await page.goto(warmPath, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForReplicatedEntrySync(page, LOAD_SHOW_ID, LOAD_SHOW_ENTRY_COUNT);
    await waitForReplicatedEntry(page, warmFixture.entryId, warmFixture.classId);
    return await context.storageState({ indexedDB: true });
  } finally {
    await closeBrowserContexts([context]);
  }
}

async function runPrimaryWorkflow(
  page: Page,
  assignment: LoadSessionAssignment,
  metrics: LoadMetrics,
  endsAt: number,
  smoke: boolean,
  onScored: (entryId: string) => void
): Promise<SessionResult> {
  switch (assignment.kind) {
    case 'ringside-scoring':
      return runScoringSession(page, assignment.index, metrics, endsAt, smoke, onScored);
    case 'secretary-check-in':
      await runCheckIn(page, assignment.index, metrics);
      return emptySessionResult();
    case 'exhibitor-read':
      await timedGoto(page, `/shows/${LOAD_SHOW_ID}?tab=my-entries`, metrics);
      await page.getByRole('heading', { name: 'My run schedule' }).waitFor();
      return emptySessionResult();
    case 'run-order-read': {
      const classId = LOAD_CLASS_IDS[assignment.index % LOAD_CLASS_IDS.length];
      await timedGoto(page, `/at-show/${LOAD_SHOW_ID}/class/${classId}`, metrics);
      await page.getByTestId('dog-card').first().waitFor();
      return emptySessionResult();
    }
    case 'operations-read':
      await timedGoto(page, `/shows/${LOAD_SHOW_ID}/show-desk`, metrics);
      await page.getByRole('heading', { name: 'Show Desk', exact: true }).waitFor();
      return emptySessionResult();
  }
}

async function runScoringSession(
  page: Page,
  sessionIndex: number,
  metrics: LoadMetrics,
  endsAt: number,
  smoke: boolean,
  onScored: (entryId: string) => void
): Promise<SessionResult> {
  const scoredEntryIds: string[] = [];
  let maxQueueDepth = 0;
  const entryCount = smoke ? 1 : LOAD_CLASS_IDS.length;

  for (let classIndex = 0; classIndex < entryCount; classIndex += 1) {
    const entryNumber = scoringEntryNumber(sessionIndex, classIndex);
    const entryId = await runScoringEntry(page, entryNumber, metrics);
    scoredEntryIds.push(entryId);
    onScored(entryId);
    maxQueueDepth = Math.max(maxQueueDepth, await readPendingMutationCount(page));

    const entriesRemaining = entryCount - classIndex - 1;
    if (entriesRemaining > 0) {
      await delay(Math.max(0, Math.floor((endsAt - Date.now()) / (entriesRemaining + 1))));
    }
  }

  return { scoredEntryIds, maxQueueDepth };
}

async function runScoringEntry(
  page: Page,
  entryNumber: number,
  metrics: LoadMetrics
): Promise<string> {
  const fixture = loadEntryFixture(entryNumber);
  await timedGoto(
    page,
    `/at-show/${LOAD_SHOW_ID}/class/${fixture.classId}/score/${fixture.entryId}`,
    metrics
  );
  await waitForReplicatedEntry(page, fixture.entryId, fixture.classId);
  const saveButton = page.getByTestId('submit-btn');
  await saveButton.waitFor({ state: 'visible', timeout: 60_000 });
  await submitQualifiedScore(page);
  await page.waitForURL(new RegExp(`/class/${fixture.classId}`));
  return fixture.entryId;
}

async function submitQualifiedScore(page: Page): Promise<void> {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const qualifiedButton = page.getByTestId('result-Q');
    const visible = await qualifiedButton
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!visible) continue;
    const qualifiedButtonHandle = await qualifiedButton.elementHandle();
    if (!qualifiedButtonHandle) continue;

    const submitted = await qualifiedButtonHandle.evaluate(async element => {
      if (!(element instanceof HTMLElement)) return false;
      const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      let saveClicked = false;
      element.click();

      for (let frame = 0; frame < 30; frame += 1) {
        await nextFrame();
        const confirm = document.querySelector<HTMLButtonElement>(
          '[data-testid="confirm-submit-btn"]'
        );
        if (confirm && !confirm.disabled) {
          confirm.click();
          return true;
        }
        const save = document.querySelector<HTMLButtonElement>('[data-testid="submit-btn"]');
        if (!saveClicked && save && !save.disabled) {
          save.click();
          saveClicked = true;
        }
      }
      return false;
    });
    if (submitted) return;
    await delay(100);
  }

  throw new Error('Expected the scoring result to remain actionable through confirmation.');
}

async function runCheckIn(page: Page, index: number, metrics: LoadMetrics): Promise<void> {
  const fixture = loadEntryFixture(441 + index);
  await timedGoto(page, `/at-show/${LOAD_SHOW_ID}/class/${fixture.classId}`, metrics);
  await waitForReplicatedEntry(page, fixture.entryId, fixture.classId);
  const dogCard = page
    .getByTestId('dog-card')
    .filter({ hasText: String(fixture.armband) })
    .first();
  await dogCard.waitFor({ state: 'visible', timeout: 60_000 });
  await dogCard.locator('[title="Tap to change status"]').click();
  const checkedInButton = page.getByRole('button', { name: 'Checked-in', exact: true });
  await checkedInButton.waitFor({ state: 'visible', timeout: 20_000 });
  await checkedInButton.click();
}

function emptySessionResult(): SessionResult {
  return { scoredEntryIds: [], maxQueueDepth: 0 };
}

async function timedGoto(page: Page, path: string, metrics: LoadMetrics): Promise<void> {
  const startedAt = performance.now();
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  metrics.recordPageDuration(performance.now() - startedAt);
}

async function assertCanonicalFixture(): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase fixture-preflight credentials.');
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { count, error } = await client
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('show_id', LOAD_SHOW_ID);
  if (error) throw new Error(`Could not preflight the load fixture: ${error.message}`);
  if (count !== LOAD_SHOW_ENTRY_COUNT) {
    throw new Error(
      `Load fixture requires exactly ${LOAD_SHOW_ENTRY_COUNT} demo-show entries; found ${count ?? 0}.`
    );
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
