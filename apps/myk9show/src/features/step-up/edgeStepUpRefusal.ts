/**
 * The client half of an edge function's step-up refusal (MYK9-1461).
 *
 * `_shared/http/handler.ts` serialises `HttpError(403, 'step_up_required')` as
 * `{ error: 'step_up_required' }` with no `code` key, and supabase-js carries that body in
 * `FunctionsHttpError.context`. A caller that only looks for `body.code` therefore sees an
 * unclassified failure and shows "please try again", when the admin cancelled (or failed)
 * the password prompt and only needs to confirm it.
 */
import { isStepUpRefusalBody, STEP_UP_REQUIRED_CODE } from './stepUpFetch';

export const STEP_UP_REFUSAL_MESSAGE = 'Confirm your password to continue.';

/** True when a FunctionsHttpError's response body is the step-up refusal. */
export async function isEdgeStepUpRefusal(error: unknown): Promise<boolean> {
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.clone !== 'function') return false;
  try {
    return isStepUpRefusalBody(await context.clone().json());
  } catch {
    return false;
  }
}

/** The error a caller throws once it has recognised the refusal. */
export function stepUpRefusalError(): Error & { code: string } {
  return Object.assign(new Error(STEP_UP_REFUSAL_MESSAGE), { code: STEP_UP_REQUIRED_CODE });
}

export function isStepUpRefusalError(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === STEP_UP_REQUIRED_CODE;
}
