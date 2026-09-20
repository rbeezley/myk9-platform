import { supabase } from '@/services/database/supabaseClient';
import { classifyPremiumPublishError } from './premiumPublishErrors';
import { publishExperience } from '@/features/experience/publishExperience';
import type { GeneratedPremium } from '@/types/premium-types';

interface PremiumPublishRpcClient {
  rpc: (
    functionName: 'begin_premium_publish',
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown | null }>;
}

const inFlightByShowId = new Map<string, Promise<{ publishedAt: string; premiumUrl: string }>>();
const ATTEMPT_STORAGE_KEY = 'myk9:premium-publish-attempts:v1';
const ATTEMPT_SCHEMA_VERSION = 1;
export interface PremiumPublishAttempt {
  premium?: GeneratedPremium;
  premiumFingerprint?: string;
  artifactId: string;
  publishedAt: string;
  publishVersion: number;
}

const attemptByShowId = new Map<string, PremiumPublishAttempt>();
const beginByShowId = new Map<string, Promise<number>>();
let hydrated = false;

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        key => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function premiumPublishFingerprint(premium: GeneratedPremium): string {
  return stableSerialize(premium);
}

function getAttemptStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function clearAttemptStorage(storage: Storage): void {
  try {
    storage.removeItem(ATTEMPT_STORAGE_KEY);
  } catch {
    // Session storage can be unavailable in privacy-restricted contexts.
  }
}

function isPersistedAttempt(value: unknown): value is PremiumPublishAttempt {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as Record<string, unknown>;
  if (
    typeof attempt.artifactId !== 'string' ||
    typeof attempt.publishedAt !== 'string' ||
    typeof attempt.publishVersion !== 'number' ||
    !Number.isSafeInteger(attempt.publishVersion) ||
    attempt.publishVersion < 1
  ) {
    return false;
  }
  if (attempt.premium === undefined) return true;
  return (
    typeof attempt.premiumFingerprint === 'string' &&
    typeof attempt.premium === 'object' &&
    attempt.premium !== null &&
    premiumPublishFingerprint(attempt.premium as GeneratedPremium) === attempt.premiumFingerprint
  );
}

function hydrateAttempts(): void {
  if (hydrated) return;
  hydrated = true;
  const storage = getAttemptStorage();
  if (!storage) return;
  try {
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
      clearAttemptStorage(storage);
      return;
    }
    for (const [showId, attempt] of Object.entries(parsed.attempts)) {
      if (showId && isPersistedAttempt(attempt)) attemptByShowId.set(showId, attempt);
    }
  } catch {
    clearAttemptStorage(storage);
  }
}

function persistAttempts(): void {
  const storage = getAttemptStorage();
  if (!storage) return;
  try {
    if (attemptByShowId.size === 0) {
      clearAttemptStorage(storage);
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

/** Server-side versioning is the ordering authority for a publish attempt. */
export async function beginPremiumPublishAttempt(showId: string): Promise<number> {
  hydrateAttempts();
  const existing = attemptByShowId.get(showId);
  if (existing) return existing.publishVersion;
  const pending = beginByShowId.get(showId);
  if (pending) return pending;

  const request = beginPremiumPublishVersion(showId);
  beginByShowId.set(showId, request);
  void request.then(
    () => {
      if (beginByShowId.get(showId) === request) beginByShowId.delete(showId);
    },
    () => {
      if (beginByShowId.get(showId) === request) beginByShowId.delete(showId);
    }
  );
  return request;
}

async function beginPremiumPublishVersion(showId: string): Promise<number> {
  const { data, error } = await (supabase as unknown as PremiumPublishRpcClient).rpc(
    'begin_premium_publish',
    { p_show_id: showId }
  );
  if (error) throw classifyPremiumPublishError(error, 'premium-metadata');

  const version = typeof data === 'number' ? data : Number(data);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw classifyPremiumPublishError(
      new Error('Premium publish attempt did not receive a server version'),
      'premium-metadata'
    );
  }
  attemptByShowId.set(showId, {
    artifactId: crypto.randomUUID(),
    publishedAt: new Date().toISOString(),
    publishVersion: version,
  });
  persistAttempts();
  return version;
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

/** Test isolation only; production retries intentionally keep failed attempts. */
export function resetPremiumPublishCoordinatorForTests(options?: {
  preserveStorage?: boolean;
}): void {
  attemptByShowId.clear();
  inFlightByShowId.clear();
  beginByShowId.clear();
  hydrated = false;
  if (!options?.preserveStorage) {
    const storage = getAttemptStorage();
    if (storage) clearAttemptStorage(storage);
  }
}

/** Existing editor saves use the same versioned coordinator as the card/menu. */
export async function publishGeneratedPremiumAttempt({
  showId,
  premium,
  inkSaver,
  artifactId,
  publishedAt,
  publishVersion,
}: {
  showId: string;
  premium: GeneratedPremium;
  inkSaver: boolean;
  artifactId?: string;
  publishedAt?: string;
  publishVersion?: number;
}) {
  hydrateAttempts();
  const inputFingerprint = premiumPublishFingerprint(premium);
  let stored = attemptByShowId.get(showId);
  if (stored?.premium && stored.premiumFingerprint !== inputFingerprint) {
    attemptByShowId.delete(showId);
    persistAttempts();
    stored = undefined;
    publishVersion = undefined;
  }
  const existing = inFlightByShowId.get(showId);
  if (existing) return existing;

  const attempt = (async () => {
    const version =
      publishVersion ?? stored?.publishVersion ?? (await beginPremiumPublishAttempt(showId));
    const stableAttempt = attemptByShowId.get(showId) ?? {
      artifactId: artifactId ?? crypto.randomUUID(),
      publishedAt: publishedAt ?? new Date().toISOString(),
      publishVersion: version,
    };
    const resolvedPremium = stableAttempt.premium ?? premium;
    const completeAttempt = {
      ...stableAttempt,
      ...(resolvedPremium
        ? { premium: resolvedPremium, premiumFingerprint: inputFingerprint }
        : {}),
      publishVersion: version,
    };
    if (!completeAttempt.premium) {
      throw new Error('Premium publish coordinator requires generated premium data');
    }
    attemptByShowId.set(showId, completeAttempt);
    persistAttempts();
    try {
      const result = await publishExperience({
        showId,
        premium: completeAttempt.premium,
        inkSaver,
        artifactId: completeAttempt.artifactId,
        publishedAt: completeAttempt.publishedAt,
        publishVersion: version,
      });
      attemptByShowId.delete(showId);
      persistAttempts();
      return result;
    } catch (error) {
      const classified = classifyPremiumPublishError(error, 'experience-snapshot');
      if (classified.code === 'stale-attempt') discardPremiumPublishAttempt(showId);
      throw classified;
    }
  })();
  inFlightByShowId.set(showId, attempt);
  void attempt.then(
    () => {
      if (inFlightByShowId.get(showId) === attempt) inFlightByShowId.delete(showId);
    },
    () => {
      if (inFlightByShowId.get(showId) === attempt) inFlightByShowId.delete(showId);
    }
  );
  return attempt;
}
