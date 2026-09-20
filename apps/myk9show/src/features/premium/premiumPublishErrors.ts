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

export function classifyPremiumPublishError(
  error: unknown,
  stage: PremiumPublishStage
): PremiumPublishError {
  if (error instanceof PremiumPublishError) return error;

  const message = errorText(error).toLowerCase();
  const code: PremiumPublishFailureCode =
    /only supported for akc and ukc|organization.*(required|missing|invalid)|organization.*null/.test(
      message
    )
      ? 'missing-organization'
      : /secretary.*(resolve|missing|not found)|no secretary/.test(message)
        ? 'missing-secretary'
        : /anthropic_api_key|service configuration|configuration error/.test(message)
          ? 'configuration'
          : /row-level security|permission denied|not authorized|unauthorized|forbidden/.test(
                message
              )
            ? 'permission'
            : 'unknown';

  return new PremiumPublishError(
    errorText(error) || 'Premium publishing failed',
    stage,
    code,
    error
  );
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
