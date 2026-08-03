import { HttpError } from './http/responses.ts';

export const AUDIENCE_RESOLUTION_ERROR = 'Audience resolution failed';

/** Abort a fanout before delivery when recipient resolution is incomplete. */
export function assertAudienceQuerySucceeded(error: unknown): void {
  if (error) throw new HttpError(500, AUDIENCE_RESOLUTION_ERROR);
}
