export type PremiumPublishStage =
  'generation' | 'pdf-render' | 'pdf-upload' | 'premium-metadata' | 'experience-snapshot';

export type PremiumPublishFailureCode =
  'missing-organization' | 'missing-secretary' | 'configuration' | 'permission' | 'unknown';

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
    default:
      return GENERIC_PREMIUM_PUBLISH_FAILURE;
  }
}
