import { HttpError } from '../_shared/http/responses.ts';

export interface PremiumRateLimitRow {
  allowed: boolean;
  attempts_count: number;
  remaining_attempts: number;
  retry_after_seconds: number;
}

export interface RunPremiumGenerationAttemptArgs<T> {
  authUserId: string;
  showId: string;
  checkRateLimit: (identity: {
    authUserId: string;
    showId: string;
  }) => Promise<{ data: unknown; error: unknown }>;
  generate: () => Promise<T>;
}

export async function runPremiumGenerationAttempt<T>(
  args: RunPremiumGenerationAttemptArgs<T>
): Promise<T> {
  let limiterResult: unknown;
  try {
    limiterResult = await args.checkRateLimit({
      authUserId: args.authUserId,
      showId: args.showId,
    });
  } catch (error) {
    console.error('Premium generation limiter call failed:', error);
    throw unavailableError();
  }

  if (!isLimiterResponse(limiterResult)) {
    console.error('Premium generation limiter returned an unusable response');
    throw unavailableError();
  }

  const row =
    Array.isArray(limiterResult.data) && limiterResult.data.length === 1
      ? limiterResult.data[0]
      : undefined;
  if (limiterResult.error || !isPremiumRateLimitRow(row)) {
    console.error('Premium generation limiter unavailable:', limiterResult.error);
    throw unavailableError();
  }

  if (!row.allowed) {
    throw new HttpError(
      429,
      'Too many premium generation attempts. Please try again later.',
      'premium_rate_limited'
    );
  }

  return args.generate();
}

function isLimiterResponse(value: unknown): value is { data: unknown; error: unknown } {
  return Boolean(value && typeof value === 'object' && 'data' in value && 'error' in value);
}

function isPremiumRateLimitRow(value: unknown): value is PremiumRateLimitRow {
  if (!value || typeof value !== 'object') return false;

  const row = value as Partial<PremiumRateLimitRow>;
  return (
    typeof row.allowed === 'boolean' &&
    Number.isInteger(row.attempts_count) &&
    Number.isInteger(row.remaining_attempts) &&
    Number.isInteger(row.retry_after_seconds) &&
    (row.attempts_count ?? -1) >= 0 &&
    (row.remaining_attempts ?? -1) >= 0 &&
    (row.retry_after_seconds ?? -1) >= 0
  );
}

function unavailableError(): HttpError {
  return new HttpError(
    503,
    'Premium generation is temporarily unavailable. Please try again.',
    'premium_rate_limit_unavailable'
  );
}
