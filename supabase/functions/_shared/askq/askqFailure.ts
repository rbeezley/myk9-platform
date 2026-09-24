import { ClaudeApiError } from './promptBuilder.ts';

export interface AskQFailure {
  httpStatus: 500 | 503;
  body: { error: string; code: 'upstream_unavailable' | 'internal_error' };
  /** Written to the reserved `chatbot_query_log.tools_used` so the row says what failed. */
  logMarker: string;
}

/**
 * Classify a failure raised after the AskQ quota was reserved (MYK9-684).
 *
 * Any model-API error — rate limit, overload, an exhausted or revoked key, a
 * rejected request — is outside the user's control and may clear on its own,
 * so it answers a 503 the client presents as "try again". Anything else is our
 * own defect and stays a 500. Either way the reserved log row is marked, since
 * edge-function logs are the only other record and they expire.
 */
export function classifyAskQFailure(error: unknown): AskQFailure {
  if (error instanceof ClaudeApiError) {
    return {
      httpStatus: 503,
      body: { error: 'AskQ is temporarily unavailable', code: 'upstream_unavailable' },
      logMarker: `upstream_error:${error.status}:${error.errorType}`,
    };
  }
  return {
    httpStatus: 500,
    body: { error: 'Internal server error', code: 'internal_error' },
    logMarker: 'internal_error',
  };
}
