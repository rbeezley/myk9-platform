export type PremiumPublishStage =
  'generation' | 'pdf-render' | 'pdf-upload' | 'premium-metadata' | 'experience-snapshot';

export type PremiumPublishFailureCode =
  | 'missing-organization'
  | 'missing-secretary'
  | 'configuration'
  | 'permission'
  | 'stale-attempt'
  | 'intent-conflict'
  | 'unknown';

export class PremiumPublishError extends Error {
  override readonly name = 'PremiumPublishError';
  readonly originalError?: unknown;

  constructor(
    message: string,
    readonly stage: PremiumPublishStage,
    readonly code: PremiumPublishFailureCode = 'unknown',
    originalError?: unknown
  ) {
    super(message);
    this.originalError = originalError;
  }
}

export function isMissingPremiumPublishRpc(
  error: unknown,
  functionName = 'begin_premium_publish'
): boolean {
  if (error instanceof PremiumPublishError && error.originalError !== undefined) {
    return isMissingPremiumPublishRpc(error.originalError, functionName);
  }
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  if (record.code !== 'PGRST202') return false;
  const detail = [record.message, record.details, record.hint]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
  return detail.includes(functionName.toLowerCase()) && /function|schema cache/.test(detail);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
}

function classifyMessage(message: string): PremiumPublishFailureCode {
  const normalized = message.toLowerCase();
  return /only supported for akc and ukc|organization.*(required|missing|invalid)|organization.*null/.test(
    normalized
  )
    ? 'missing-organization'
    : /secretary.*(resolve|missing|not found)|no secretary/.test(normalized)
      ? 'missing-secretary'
      : /anthropic_api_key|service configuration|configuration error/.test(normalized)
        ? 'configuration'
        : /stale|superseded|already committed to another path/.test(normalized)
          ? 'stale-attempt'
          : /row-level security|permission denied|not authorized|unauthorized|forbidden/.test(
                normalized
              )
            ? 'permission'
            : 'unknown';
}

export function classifyPremiumPublishError(
  error: unknown,
  stage: PremiumPublishStage
): PremiumPublishError {
  if (error instanceof PremiumPublishError) return error;

  const message = errorText(error);
  const code = classifyMessage(message);

  return new PremiumPublishError(message || 'Premium publishing failed', stage, code, error);
}

/**
 * Supabase FunctionsHttpError keeps the useful Edge response in context, not
 * in Error.message. Read only its structured `error` field; raw payloads stay
 * in logs/originalError and never become user copy.
 */
export async function classifyPremiumFunctionError(
  error: unknown,
  stage: PremiumPublishStage
): Promise<PremiumPublishError> {
  if (error instanceof PremiumPublishError) return error;

  const context =
    error && typeof error === 'object' && 'context' in error
      ? (error as { context?: unknown }).context
      : undefined;
  let bodyMessage = '';
  if (
    context &&
    typeof context === 'object' &&
    'json' in context &&
    typeof (context as { json?: unknown }).json === 'function'
  ) {
    try {
      const body = await (context as { json: () => Promise<unknown> }).json();
      if (body && typeof body === 'object' && 'error' in body) {
        const responseError = (body as { error?: unknown }).error;
        bodyMessage =
          typeof responseError === 'string'
            ? responseError
            : responseError && typeof responseError === 'object' && 'message' in responseError
              ? String((responseError as { message?: unknown }).message ?? '')
              : '';
      }
    } catch {
      // A non-JSON response is an unknown failure; preserve the safe fallback.
    }
  }

  const message = bodyMessage || errorText(error);
  const code = classifyMessage(message);
  return new PremiumPublishError(message || 'Premium publishing failed', stage, code, error);
}

export const GENERIC_PREMIUM_PUBLISH_FAILURE =
  "We couldn't publish the premium list. Please try again.";

export function premiumPublishFailureMessage(error: PremiumPublishError): string {
  switch (error.code) {
    case 'missing-organization':
      return "Set this show's organization to AKC or UKC in Show settings, then try again.";
    case 'missing-secretary':
      return 'Add a secretary to this show before publishing the premium list.';
    case 'configuration':
      return 'Premium publishing is temporarily unavailable. Please contact support.';
    case 'permission':
      return "You do not have permission to publish this show's premium list. Ask the show owner to add you as a secretary.";
    case 'stale-attempt':
      return 'Another publish started for this show. Try publishing again to continue.';
    case 'intent-conflict':
      return 'A different premium list is already publishing for this show. Wait for it to finish, then try again.';
    default:
      return GENERIC_PREMIUM_PUBLISH_FAILURE;
  }
}
