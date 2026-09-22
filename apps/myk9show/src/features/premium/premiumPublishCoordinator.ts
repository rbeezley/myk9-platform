import { supabase } from '@/services/database/supabaseClient';
import { publishExperience } from '@/features/experience/publishExperience';
import { publishExperienceLegacy } from '@/features/experience/publishExperienceLegacy';
import {
  classifyPremiumPublishError,
  isMissingPremiumPublishRpc,
  PremiumPublishError,
} from './premiumPublishErrors';
import type { PremiumPublishAttempt, PremiumPublishIntent } from './premiumPublishIntent';
import { premiumPublishIntentFingerprint } from './premiumPublishIntent';
import { parseGeneratedPremium, parsePersistedPremiumAttempt } from './premiumPublishSchema';

interface PremiumPublishRpcClient {
  rpc: (
    functionName: 'begin_premium_publish',
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown | null }>;
}

type PublishResult = { publishedAt: string; premiumUrl: string };
const inFlightByShowId = new Map<
  string,
  { fingerprint: string; promise: Promise<PublishResult> }
>();
const ATTEMPT_STORAGE_KEY = 'myk9:premium-publish-attempts:v2';
const LEGACY_ATTEMPT_STORAGE_KEY = 'myk9:premium-publish-attempts:v1';
const ATTEMPT_SCHEMA_VERSION = 2;
const attemptByShowId = new Map<string, PremiumPublishAttempt>();
const reservedVersionByShowId = new Map<string, Promise<number>>();
const legacySchemaByShowId = new Set<string>();
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
    storage.removeItem(LEGACY_ATTEMPT_STORAGE_KEY);
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
        attempt.fingerprint === premiumPublishIntentFingerprint(attempt.intent)
      ) {
        attemptByShowId.set(showId, attempt);
      }
    }
    persistAttempts();
  } catch {
    storage.removeItem(ATTEMPT_STORAGE_KEY);
  }
}

async function beginPremiumPublishVersion(showId: string): Promise<number> {
  const { data, error } = await (supabase as unknown as PremiumPublishRpcClient).rpc(
    'begin_premium_publish',
    { p_show_id: showId }
  );
  if (error) throw error;
  const version = typeof data === 'number' ? data : Number(data);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new PremiumPublishError(
      'Premium publish attempt did not receive a server version',
      'premium-metadata'
    );
  }
  return version;
}

/** Reserve the ordering token before premium generation begins. */
export function beginPremiumPublishAttempt(showId: string): Promise<number> {
  hydrateAttempts();
  const current = attemptByShowId.get(showId);
  if (current) return Promise.resolve(current.publishVersion);
  const pending = reservedVersionByShowId.get(showId);
  if (pending) return pending;
  const reservation = beginPremiumPublishVersion(showId).catch(error => {
    if (isMissingPremiumPublishRpc(error)) {
      legacySchemaByShowId.add(showId);
      return 0;
    }
    throw classifyPremiumPublishError(error, 'premium-metadata');
  });
  reservedVersionByShowId.set(showId, reservation);
  void reservation.catch(() => {
    if (reservedVersionByShowId.get(showId) === reservation) reservedVersionByShowId.delete(showId);
  });
  return reservation;
}

export function getPremiumPublishAttempt(showId: string): PremiumPublishAttempt | undefined {
  hydrateAttempts();
  return attemptByShowId.get(showId);
}

export function discardPremiumPublishAttempt(showId: string): void {
  hydrateAttempts();
  attemptByShowId.delete(showId);
  reservedVersionByShowId.delete(showId);
  persistAttempts();
}

/** Test isolation only; production retries intentionally keep failed attempts. */
export function resetPremiumPublishCoordinatorForTests(options?: {
  preserveStorage?: boolean;
}): void {
  attemptByShowId.clear();
  reservedVersionByShowId.clear();
  inFlightByShowId.clear();
  legacySchemaByShowId.clear();
  hydrated = false;
  if (!options?.preserveStorage) {
    const storage = getAttemptStorage();
    storage?.removeItem(ATTEMPT_STORAGE_KEY);
    storage?.removeItem(LEGACY_ATTEMPT_STORAGE_KEY);
  }
}

export async function publishGeneratedPremiumAttempt({
  showId,
  premium,
  inkSaver,
}: {
  showId: string;
  premium: unknown;
  inkSaver: boolean;
}): Promise<PublishResult> {
  hydrateAttempts();
  const intent: PremiumPublishIntent = { premium: parseGeneratedPremium(premium), inkSaver };
  const fingerprint = premiumPublishIntentFingerprint(intent);
  const inFlight = inFlightByShowId.get(showId);
  if (inFlight) {
    if (inFlight.fingerprint === fingerprint) return inFlight.promise;
    throw new PremiumPublishError(
      'A different premium list is already publishing for this show',
      'premium-metadata',
      'intent-conflict'
    );
  }

  const promise = (async () => {
    if (legacySchemaByShowId.has(showId)) {
      return publishExperienceLegacy({ showId, intent });
    }
    let attempt = attemptByShowId.get(showId);
    if (attempt && attempt.fingerprint !== fingerprint) {
      discardPremiumPublishAttempt(showId);
      attempt = undefined;
    }
    if (!attempt) {
      const reserved = reservedVersionByShowId.get(showId);
      const version = reserved
        ? await reserved
        : await beginPremiumPublishVersion(showId).catch(error => {
            if (isMissingPremiumPublishRpc(error)) {
              legacySchemaByShowId.add(showId);
              return 0;
            }
            throw classifyPremiumPublishError(error, 'premium-metadata');
          });
      reservedVersionByShowId.delete(showId);
      if (version === 0 || legacySchemaByShowId.has(showId)) {
        return publishExperienceLegacy({ showId, intent });
      }
      attempt = {
        schemaVersion: ATTEMPT_SCHEMA_VERSION,
        showId,
        fingerprint,
        intent,
        artifactId: crypto.randomUUID(),
        publishVersion: version,
      };
      attemptByShowId.set(showId, attempt);
      persistAttempts();
    }

    try {
      const result = await publishExperience({ showId, attempt });
      discardPremiumPublishAttempt(showId);
      return result;
    } catch (error) {
      if (isMissingPremiumPublishRpc(error, 'publish_premium_artifact')) {
        discardPremiumPublishAttempt(showId);
        legacySchemaByShowId.add(showId);
        return publishExperienceLegacy({ showId, intent });
      }
      const classified = classifyPremiumPublishError(error, 'experience-snapshot');
      if (classified.code === 'stale-attempt') discardPremiumPublishAttempt(showId);
      throw classified;
    }
  })();
  inFlightByShowId.set(showId, { fingerprint, promise });
  void promise.then(
    () => {
      if (inFlightByShowId.get(showId)?.promise === promise) inFlightByShowId.delete(showId);
    },
    () => {
      if (inFlightByShowId.get(showId)?.promise === promise) inFlightByShowId.delete(showId);
    }
  );
  return promise;
}
