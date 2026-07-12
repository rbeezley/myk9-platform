export interface RateLimitResult {
  allowed: boolean;
  attempts_count: number;
  remaining_attempts: number;
  blocked_until: string | null;
  message: string;
}

export interface OperatorAlertInsert {
  source: string;
  severity: 'error';
  title: string;
  detail: Record<string, unknown>;
  dedupe_key: string;
}

export type RateLimitGateResult =
  | { kind: 'allowed'; rateLimit: RateLimitResult }
  | { kind: 'response'; status: 429 | 503; body: Record<string, unknown> };

export interface EnforcePasscodeRateLimitArgs {
  clientIP: string;
  checkRateLimit: () => Promise<{ data: unknown; error: unknown }>;
  recordBlockedAttempt: () => Promise<void>;
  persistAlert: (alert: OperatorAlertInsert) => Promise<void>;
  logError: (message: string, error?: unknown) => void;
}

function isRateLimitResult(value: unknown): value is RateLimitResult {
  if (!value || typeof value !== 'object') return false;

  const result = value as Partial<RateLimitResult>;
  return (
    typeof result.allowed === 'boolean' &&
    Number.isInteger(result.attempts_count) &&
    Number.isInteger(result.remaining_attempts) &&
    (result.blocked_until === null || typeof result.blocked_until === 'string') &&
    typeof result.message === 'string'
  );
}

async function unavailable(
  args: EnforcePasscodeRateLimitArgs,
  error: unknown
): Promise<RateLimitGateResult> {
  args.logError('Passcode rate limiter unavailable', error);

  try {
    await args.persistAlert({
      source: 'validate-passcode',
      severity: 'error',
      title: 'Passcode rate limiter unavailable',
      detail: {
        component: 'check_login_rate_limit',
        client_ip: args.clientIP,
      },
      dedupe_key: `check_login_rate_limit:${args.clientIP}`,
    });
  } catch (alertError) {
    args.logError('Failed to persist passcode limiter alert', alertError);
  }

  return {
    kind: 'response',
    status: 503,
    body: {
      error: 'rate_limit_unavailable',
      message: 'Passcode validation is temporarily unavailable. Please try again.',
    },
  };
}

export async function enforcePasscodeRateLimit(
  args: EnforcePasscodeRateLimitArgs
): Promise<RateLimitGateResult> {
  let checkResult: { data: unknown; error: unknown };
  try {
    checkResult = await args.checkRateLimit();
  } catch (error) {
    return unavailable(args, error);
  }

  const { data, error } = checkResult;
  const rateLimit = Array.isArray(data) ? data[0] : undefined;

  if (error || !isRateLimitResult(rateLimit)) {
    return unavailable(args, error ?? new Error('Limiter returned unusable data'));
  }

  if (!rateLimit.allowed) {
    try {
      await args.recordBlockedAttempt();
    } catch (recordError) {
      args.logError('Failed to record blocked passcode attempt', recordError);
    }

    return {
      kind: 'response',
      status: 429,
      body: {
        error: 'rate_limited',
        message: rateLimit.message,
        blocked_until: rateLimit.blocked_until,
        remaining_attempts: 0,
      },
    };
  }

  return { kind: 'allowed', rateLimit };
}
