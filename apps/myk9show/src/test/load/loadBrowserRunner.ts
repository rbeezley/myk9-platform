import { createClient } from '@supabase/supabase-js';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { signInAsExhibitor, signInAsSecretary } from '../e2e/helpers/testUsers';
import { assertApplicationTarget } from './loadAppTarget';
import {
  buildSessionAssignments,
  type LoadSessionAssignment,
  type LoadSessionTarget,
} from './loadAssignments';
import type { LoadObservation } from './loadEvaluation';
import {
  loadEntryFixture,
  loadEntryFixtureFor,
  LOAD_SHOWS,
  LOAD_SHOW_ENTRY_COUNT,
  LOAD_SHOW_ID,
} from './loadFixture';
import { LOAD_CLASS_AUTHENTICATED_COLUMN_SELECT } from './loadClassColumns';
import { planGeneration } from './loadGenerationPlan';
import {
  assertScopedToOwnShow,
  assertStaffCredentialsComplete,
  authenticateAndResolveScope,
  resolveStaffCredentials,
} from './loadStaffCredentials';
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
import { VirtualUserFleet } from './loadVirtualUserFleet';
import type { ResolvedLoadTarget } from './loadTarget';

const ENTRY_RESULT_REPLICA_VERSION_KEY = 'myk9:entry-result-replica-version';
const ENTRY_RESULT_REPLICA_VERSION = '20260620-authenticated-entry-results-view-v2';
const SESSION_PREPARATION_CONCURRENCY = 10;
const BROWSER_CONTEXT_CLOSE_TIMEOUT_MS = 2_000;
/** Kinds that score. They finish when their dogs are scored rather than holding open. */
const SCORING_WORKLOAD_KINDS: readonly string[] = ['ringside-scoring', 'scoring-correction'];

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
  // Readers are the bulk of the workload and 270 Chromium contexts do not fit on
  // sixteen runners: all-browser generation needs 22.4 contexts per runner against
  // today's 6-7. Writers stay real; one reader per runner stays real so rendering
  // coverage survives.
  const generation = planGeneration(assignments, { browserReaderSample: 1 });
  const contexts: BrowserContext[] = [];
  let virtualUsers: VirtualUserFleet | undefined;
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
    // Fail closed BEFORE the reseed window is spent. A missing credential costs a
    // refused dispatch; discovering it after the barrier costs the whole approved
    // window, and a run where every staff session silently saw all four shows
    // would look like it worked.
    const staff = resolveStaffCredentials(process.env);
    assertStaffCredentialsComplete(staff);
    const supabaseUrl = requiredEnv('VITE_SUPABASE_URL');
    const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');
    const staffAuth = await Promise.all(
      staff.credentials.map(credential =>
        authenticateAndResolveScope(supabaseUrl, anonKey, credential)
      )
    );
    // Scope comes from the database, never the fixture: manageable_show_ids()
    // resolves through four arms and one of them is club-scoped.
    assertScopedToOwnShow(staffAuth.map(entry => entry.scope));
    const secretaryTokens = new Map(
      staffAuth.map(entry => [entry.scope.showIndex, entry.accessToken])
    );

    const secretaryState = await createAuthState(browser, target.baseUrl, 'secretary');
    const exhibitorState = await createAuthState(browser, target.baseUrl, 'exhibitor');
    const exhibitorAccessToken = await exhibitorAccessTokenFor(supabaseUrl, anonKey);
    const preparedSessions = await mapWithConcurrency(
      generation.browser,
      SESSION_PREPARATION_CONCURRENCY,
      async assignment => {
        // Exhibitor self-check-in is a different authorization path and a
        // different mutation from the staff check-in. Running it under staff
        // credentials would exercise the secretary path and report it as
        // exhibitor coverage.
        const storageState = assignment.role === 'exhibitor' ? exhibitorState : secretaryState;
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
    // Built after the browser contexts and hydrated before the barrier, so their
    // cold first pass is not measured as steady-state load.
    if (generation.virtualUser.length > 0) {
      virtualUsers = new VirtualUserFleet(generation.virtualUser, {
        supabaseUrl,
        anonKey,
        accessTokenFor: (role, showIndex) =>
          role === 'exhibitor'
            ? exhibitorAccessToken
            : (secretaryTokens.get(showIndex) ?? secretaryTokens.get(0) ?? ''),
        classColumnSelect: LOAD_CLASS_AUTHENTICATED_COLUMN_SELECT,
        onSample: sample =>
          metrics.recordVirtualUserRequest({ durationMs: sample.durationMs, ok: sample.ok }),
      });
      await virtualUsers.hydrate();
    }
    generatorSampler.markContextsPrepared();
    // Distributed runs sample the platform from a dedicated browser-free runner:
    // a shard that polls the database while also driving browser contexts
    // saturates itself, and that saturation invalidates the attribution.
    const collectPlatform = !options.smoke && !options.shard;
    platformSampler = collectPlatform
      ? await startLoadPlatformSampler(process.env, scenario.targets.databaseConnectionCap)
      : undefined;
    if (options.shard) await delay(scheduledStartDelayMs(options.shard));
    lifecycle.markPrepared(assertAllSessionsOpenAtStart(preparedSessions));
    // The virtual readers are sessions too. Counting only browser sessions made
    // `concurrentSessions` report 110 of 358, which the G9 gate can never accept
    // (MYK9-126). They are prepared once hydrated, and start with the barrier.
    if (virtualUsers) {
      lifecycle.markPrepared(virtualUsers.assignments);
      for (const assignment of virtualUsers.assignments) lifecycle.markStarted(assignment);
    }
    virtualUsers?.start();
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
          if (!options.smoke && !SCORING_WORKLOAD_KINDS.includes(assignment.kind)) {
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

    // The measurement window is the SCENARIO's, not "however long the browser
    // sessions happened to last". Only a successful non-scoring session held to
    // `endsAt`; a failed one returned immediately and a scoring one skips the
    // hold, so a shard whose sessions all failed stopped its virtual readers
    // after ~90 s while a shard with one surviving reader ran the full 600 s.
    // The 2026-08-28 rehearsal produced exactly that: five shards at 600 s and
    // eleven between 85 s and 158 s, which makes every aggregate percentile an
    // average over incommensurable windows (MYK9-126).
    if (!options.smoke) await delay(connectedSessionHoldMs(endsAt, Date.now()));

    // Reconciliation/teardown is not generator load. Stop at the workload boundary.
    virtualUsers?.stop();
    if (virtualUsers) {
      for (const outcome of virtualUsers.outcomes()) {
        if (outcome.ok) lifecycle.markCompleted(outcome.assignment);
        else lifecycle.markFailed(outcome.assignment);
      }
    }
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
    // Unconditional: a throw before the workload boundary would otherwise leave
    // reader intervals polling the shared target after the approved window has
    // closed. Stopping is idempotent, so the happy-path call above is harmless.
    virtualUsers?.stop();
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
  const { target } = assignment;
  switch (assignment.kind) {
    // A judge works one ring, dog after dog — not across classes. The old model
    // walked each session over every class, which is what produced multiple
    // scorers per class row.
    case 'ringside-scoring':
      return runScoringSession(page, target, metrics, endsAt, smoke, onScored);

    // Same ring, same first entry as that ring's scorer: a deliberate,
    // bounded optimistic-concurrency collision.
    case 'scoring-correction':
      return runScoringSession(page, target, metrics, endsAt, true, onScored);

    case 'steward-check-in':
    case 'exhibitor-check-in':
      await runCheckIn(page, target, metrics);
      return emptySessionResult();

    // The one class-row lock holder that never goes through the entries trigger.
    case 'secretary-class-edit':
      await timedGoto(page, `/at-show/${target.showId}/class/${target.classId}`, metrics);
      await page.getByTestId('dog-card').first().waitFor();
      return emptySessionResult();

    case 'exhibitor-read':
      await timedGoto(page, `/shows/${target.showId}?tab=my-entries`, metrics);
      await page.getByRole('heading', { name: 'My run schedule' }).waitFor();
      return emptySessionResult();

    case 'run-order-read':
      await timedGoto(page, `/at-show/${target.showId}/class/${target.classId}`, metrics);
      await page.getByTestId('dog-card').first().waitFor();
      return emptySessionResult();

    case 'operations-read':
      await timedGoto(page, `/shows/${target.showId}/show-desk`, metrics);
      await page.getByRole('heading', { name: 'Show Desk', exact: true }).waitFor();
      return emptySessionResult();
  }
}

/**
 * Dogs a single ring gets through in one scenario. Eight over ten minutes is
 * roughly one every 75 seconds, matching how a judge actually paces a class, and
 * keeps write volume per session comparable with every prior measurement.
 */
const SCORED_DOGS_PER_SESSION = 8;

async function runScoringSession(
  page: Page,
  target: LoadSessionTarget,
  metrics: LoadMetrics,
  endsAt: number,
  smoke: boolean,
  onScored: (entryId: string) => void
): Promise<SessionResult> {
  const scoredEntryIds: string[] = [];
  let maxQueueDepth = 0;
  const show = LOAD_SHOWS[target.showIndex];
  const dogCount = smoke ? 1 : SCORED_DOGS_PER_SESSION;

  for (let dogOffset = 0; dogOffset < dogCount; dogOffset += 1) {
    // Successive dogs in this ring's own class. The ring never changes: two
    // scorers on one class row is the condition this workload exists to avoid.
    const entryNumber = target.entryNumber + dogOffset * show.ringCount;
    const entryId = await runScoringEntry(page, target, entryNumber, metrics);
    scoredEntryIds.push(entryId);
    onScored(entryId);
    maxQueueDepth = Math.max(maxQueueDepth, await readPendingMutationCount(page));

    const remaining = dogCount - dogOffset - 1;
    if (remaining > 0) {
      await delay(Math.max(0, Math.floor((endsAt - Date.now()) / (remaining + 1))));
    }
  }

  return { scoredEntryIds, maxQueueDepth };
}

async function runScoringEntry(
  page: Page,
  target: LoadSessionTarget,
  entryNumber: number,
  metrics: LoadMetrics
): Promise<string> {
  const fixture = loadEntryFixtureFor(target.showIndex, entryNumber);
  await timedGoto(
    page,
    `/at-show/${target.showId}/class/${fixture.classId}/score/${fixture.entryId}`,
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

async function runCheckIn(
  page: Page,
  target: LoadSessionTarget,
  metrics: LoadMetrics
): Promise<void> {
  const fixture = loadEntryFixtureFor(target.showIndex, target.entryNumber);
  await timedGoto(page, `/at-show/${target.showId}/class/${fixture.classId}`, metrics);
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

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to drive API-level virtual readers.`);
  return value;
}

/** One exhibitor token serves every exhibitor reader; they share a scope. */
async function exhibitorAccessTokenFor(supabaseUrl: string, anonKey: string): Promise<string> {
  const email = process.env.E2E_DEMO_EXHIBITOR_EMAIL ?? 'exhibitor@myk9t.com';
  const password = process.env.E2E_DEMO_EXHIBITOR_PASSWORD;
  if (!password) throw new Error('E2E_DEMO_EXHIBITOR_PASSWORD is required for virtual readers.');
  const { accessToken } = await authenticateAndResolveScope(supabaseUrl, anonKey, {
    email,
    password,
    showIndex: 0,
  });
  return accessToken;
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
