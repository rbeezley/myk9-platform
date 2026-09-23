import { supabase } from '@/services/database/supabaseClient';
import { publishExperience } from '@/features/experience/publishExperience';
import {
  classifyPremiumPublishError,
  isMissingPremiumPublishRpc,
  PremiumPublishError,
} from './premiumPublishErrors';
import {
  premiumPublishDraftKey,
  premiumPublishIntentFingerprint,
  type PremiumPublishAttempt,
  type PremiumPublishIntent,
} from './premiumPublishIntent';
import { parseGeneratedPremium, parsePersistedPremiumAttempt } from './premiumPublishSchema';

interface PremiumPublishRpcClient {
  rpc: (
    functionName: 'begin_or_reconcile_premium_publish',
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown | null }>;
}

export type PublishResult = { publishedAt: string; premiumUrl: string };

export interface PremiumPublishOperation {
  showId: string;
  mode: 'generated' | 'draft';
  /** Stable before async work; identical actions share one operation promise. */
  intentKey: string;
  inkSaver: boolean;
  createPremium: () => Promise<unknown>;
}

interface Reservation {
  version: number;
  alreadyCommitted?: PublishResult;
}

const inFlightByShowId = new Map<
  string,
  { mode: PremiumPublishOperation['mode']; intentKey: string; promise: Promise<PublishResult> }
>();
const ATTEMPT_STORAGE_KEY = 'myk9:premium-publish-attempts:v4';
const LEGACY_ATTEMPT_STORAGE_KEYS = [
  'myk9:premium-publish-attempts:v1',
  'myk9:premium-publish-attempts:v2',
  'myk9:premium-publish-attempts:v3',
];
const ATTEMPT_SCHEMA_VERSION = 4;
export const GENERATED_PREMIUM_INTENT_KEY = 'generated-current-sources';
const attemptByShowId = new Map<string, PremiumPublishAttempt>();
let hydrated = false;

function getAttemptStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function persistAttempts(): void {
  const storage = getAttemptStorage();
  if (!storage) return;
  try {
    if (attemptByShowId.size === 0) {
      storage.removeItem(ATTEMPT_STORAGE_KEY);
      return;
    }
    storage.setItem(
      ATTEMPT_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: ATTEMPT_SCHEMA_VERSION,
        attempts: Object.fromEntries(attemptByShowId),
      })
    );
  } catch {
    // Session storage is a recovery aid, never a reason to block publishing.
  }
}

function hydrateAttempts(): void {
  if (hydrated) return;
  hydrated = true;
  const storage = getAttemptStorage();
  if (!storage) return;
  try {
    LEGACY_ATTEMPT_STORAGE_KEYS.forEach(key => storage.removeItem(key));
    const parsed = JSON.parse(storage.getItem(ATTEMPT_STORAGE_KEY) ?? 'null') as {
      schemaVersion?: unknown;
      attempts?: unknown;
    } | null;
    if (
      parsed?.schemaVersion !== ATTEMPT_SCHEMA_VERSION ||
      !parsed.attempts ||
      typeof parsed.attempts !== 'object' ||
      Array.isArray(parsed.attempts)
    ) {
      storage.removeItem(ATTEMPT_STORAGE_KEY);
      return;
    }
    for (const [showId, value] of Object.entries(parsed.attempts)) {
      const attempt = parsePersistedPremiumAttempt(value);
      if (
        attempt &&
        attempt.showId === showId &&
        attempt.fingerprint ===
          premiumPublishIntentFingerprint(attempt.intent, attempt.publisherId) &&
        (attempt.mode === 'generated'
          ? attempt.intentKey === GENERATED_PREMIUM_INTENT_KEY
          : attempt.intentKey === premiumPublishDraftKey(attempt.intent))
      ) {
        attemptByShowId.set(showId, attempt);
      }
    }
    persistAttempts();
  } catch {
    storage.removeItem(ATTEMPT_STORAGE_KEY);
  }
}

async function getPremiumPublisherId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    throw new PremiumPublishError(
      'Sign in again before publishing the premium list.',
      'premium-metadata',
      'permission'
    );
  }
  return data.user.id;
}

function resultFromCommitted(data: unknown): PublishResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new PremiumPublishError(
      'Premium publish reservation returned an invalid result',
      'premium-metadata'
    );
  }
  const value = data as Record<string, unknown>;
  if (value.status === 'already_committed') {
    if (typeof value.publishedAt !== 'string' || typeof value.premiumUrl !== 'string') {
      throw new PremiumPublishError(
        'Committed premium metadata was incomplete',
        'premium-metadata'
      );
    }
    return { publishedAt: value.publishedAt, premiumUrl: value.premiumUrl };
  }
  throw new PremiumPublishError('Premium publish operation was not committed', 'premium-metadata');
}

async function reserveOrReconcile(
  showId: string,
  priorAttempt: PremiumPublishAttempt | undefined
): Promise<Reservation> {
  const reconcile = Boolean(priorAttempt);
  const priorPath = priorAttempt ? `${showId}/${priorAttempt.artifactId}.pdf` : null;
  const { data, error } = await (supabase as unknown as PremiumPublishRpcClient).rpc(
    'begin_or_reconcile_premium_publish',
    {
      p_show_id: showId,
      p_prior_version: reconcile ? priorAttempt?.publishVersion : null,
      p_prior_path: priorPath,
    }
  );
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new PremiumPublishError(
      'Premium publish reservation returned an invalid result',
      'premium-metadata'
    );
  }
  const result = data as Record<string, unknown>;
  if (result.status === 'already_committed') {
    return { version: 0, alreadyCommitted: resultFromCommitted(data) };
  }
  const version = Number(result.version);
  if (result.status !== 'reserved' || !Number.isSafeInteger(version) || version < 1) {
    throw new PremiumPublishError(
      'Premium publish attempt did not receive a server version',
      'premium-metadata'
    );
  }
  return { version };
}

export function getPremiumPublishAttempt(showId: string): PremiumPublishAttempt | undefined {
  hydrateAttempts();
  return attemptByShowId.get(showId);
}

export function discardPremiumPublishAttempt(showId: string): void {
  hydrateAttempts();
  attemptByShowId.delete(showId);
  persistAttempts();
}

/**
 * Owns every premium publication from the synchronous per-show lock through
 * source generation, staging, and atomic commit. Generated and authored-draft
 * entry points use the same lock and server reconciliation boundary.
 */
export function runPremiumPublishOperation(
  operation: PremiumPublishOperation
): Promise<PublishResult> {
  hydrateAttempts();
  const active = inFlightByShowId.get(operation.showId);
  if (active) {
    if (active.mode === operation.mode && active.intentKey === operation.intentKey) {
      return active.promise;
    }
    return Promise.reject(
      new PremiumPublishError(
        'A different premium list is already publishing for this show',
        'premium-metadata',
        'intent-conflict'
      )
    );
  }

  // Install the lock before the operation's first await so every entry point
  // observes the same reservation, including the edit-panel draft action.
  const promise = runLockedPremiumPublishOperation(operation);
  inFlightByShowId.set(operation.showId, {
    mode: operation.mode,
    intentKey: operation.intentKey,
    promise,
  });
  void promise.then(
    () => {
      if (inFlightByShowId.get(operation.showId)?.promise === promise) {
        inFlightByShowId.delete(operation.showId);
      }
    },
    () => {
      if (inFlightByShowId.get(operation.showId)?.promise === promise) {
        inFlightByShowId.delete(operation.showId);
      }
    }
  );
  return promise;
}

async function runLockedPremiumPublishOperation(
  operation: PremiumPublishOperation
): Promise<PublishResult> {
  const { showId, mode, intentKey, inkSaver } = operation;
  let priorAttempt: PremiumPublishAttempt | undefined;
  let publisherId = '';
  try {
    publisherId = await getPremiumPublisherId();
    priorAttempt = attemptByShowId.get(showId);
    // Generated-source retries reconcile before calling the LLM. Authored
    // drafts reconcile only when the requested immutable draft intent matches.
    const mayReconcile =
      priorAttempt?.mode === mode &&
      (mode === 'generated' || priorAttempt.intentKey === intentKey) &&
      priorAttempt.publisherId === publisherId;
    const reservation = await reserveOrReconcile(
      showId,
      mayReconcile ? priorAttempt : undefined
    ).catch(error => Promise.reject(classifyPremiumPublishError(error, 'premium-metadata')));
    if (reservation.alreadyCommitted) {
      discardPremiumPublishAttempt(showId);
      return reservation.alreadyCommitted;
    }

    const premium = parseGeneratedPremium(await operation.createPremium());
    const intent: PremiumPublishIntent = { premium, inkSaver };
    const fingerprint = premiumPublishIntentFingerprint(intent, publisherId);
    const sameIntent = Boolean(
      priorAttempt &&
      priorAttempt.mode === mode &&
      priorAttempt.intentKey === intentKey &&
      priorAttempt.publisherId === publisherId &&
      priorAttempt.fingerprint === fingerprint
    );
    const attempt: PremiumPublishAttempt = {
      schemaVersion: ATTEMPT_SCHEMA_VERSION,
      mode,
      intentKey,
      showId,
      publisherId,
      fingerprint,
      intent,
      artifactId: sameIntent && priorAttempt ? priorAttempt.artifactId : crypto.randomUUID(),
      publishVersion: reservation.version,
    };
    attemptByShowId.set(showId, attempt);
    persistAttempts();

    try {
      const result = await publishExperience({ showId, attempt });
      discardPremiumPublishAttempt(showId);
      return result;
    } catch (error) {
      if (isMissingPremiumPublishRpc(error, 'publish_premium_artifact')) {
        throw classifyPremiumPublishError(error, 'experience-snapshot');
      }
      const classified = classifyPremiumPublishError(error, 'experience-snapshot');
      if (classified.code === 'stale-attempt') discardPremiumPublishAttempt(showId);
      throw classified;
    }
  } catch (error) {
    throw classifyPremiumPublishError(error, 'generation');
  }
}

/** Test isolation only; production retries intentionally keep failed attempts. */
export function resetPremiumPublishCoordinatorForTests(options?: {
  preserveStorage?: boolean;
}): void {
  attemptByShowId.clear();
  inFlightByShowId.clear();
  hydrated = false;
  if (!options?.preserveStorage) {
    const storage = getAttemptStorage();
    storage?.removeItem(ATTEMPT_STORAGE_KEY);
    LEGACY_ATTEMPT_STORAGE_KEYS.forEach(key => storage?.removeItem(key));
  }
}

export { premiumPublishDraftKey };
