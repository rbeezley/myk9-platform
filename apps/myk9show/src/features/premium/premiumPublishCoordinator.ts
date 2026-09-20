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
export interface PremiumPublishAttempt {
  premium?: GeneratedPremium;
  artifactId: string;
  publishedAt: string;
  publishVersion: number;
}

const attemptByShowId = new Map<string, PremiumPublishAttempt>();
const beginByShowId = new Map<string, Promise<number>>();

/** Server-side versioning is the ordering authority for a publish attempt. */
export async function beginPremiumPublishAttempt(showId: string): Promise<number> {
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
  return version;
}

export function getPremiumPublishAttempt(showId: string): PremiumPublishAttempt | undefined {
  return attemptByShowId.get(showId);
}

export function discardPremiumPublishAttempt(showId: string): void {
  attemptByShowId.delete(showId);
}

/** Test isolation only; production retries intentionally keep failed attempts. */
export function resetPremiumPublishCoordinatorForTests(): void {
  attemptByShowId.clear();
  inFlightByShowId.clear();
  beginByShowId.clear();
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
  const existing = inFlightByShowId.get(showId);
  if (existing) return existing;

  const attempt = (async () => {
    const stored = attemptByShowId.get(showId);
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
      ...(resolvedPremium ? { premium: resolvedPremium } : {}),
      publishVersion: version,
    };
    if (!completeAttempt.premium) {
      throw new Error('Premium publish coordinator requires generated premium data');
    }
    attemptByShowId.set(showId, completeAttempt);
    const result = await publishExperience({
      showId,
      premium: completeAttempt.premium,
      inkSaver,
      artifactId: completeAttempt.artifactId,
      publishedAt: completeAttempt.publishedAt,
      publishVersion: version,
    });
    attemptByShowId.delete(showId);
    return result;
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
