import { extractApiErrorCode } from './loadErrorCodes';

/**
 * One non-2xx response, or a request that never got one (status 0), as the
 * reader's fetch saw it.
 */
export interface ApiErrorObservation {
  readonly status: number;
  readonly code?: string;
}

/**
 * Wraps the reader's fetch so EVERY failed response is observed, not only the one
 * supabase-js finally reports. `await run()` sees the last response alone, so a
 * 503 PGRST003 that a retry recovered would vanish from the error counts while
 * the pooler was visibly refusing connections. This is the single source of truth
 * for the error-code tally; the final per-request outcome (and so availability)
 * still comes from the samples.
 *
 * The code is read from `response.clone()`, so the original body is never
 * consumed and retries are untouched. Reads are tracked in `pending` so the pass
 * can settle them before it reports.
 */
export function observingFetch(
  inner: typeof fetch,
  record: (observation: ApiErrorObservation) => void,
  signal: AbortSignal,
  pending: Set<Promise<void>>
): typeof fetch {
  return (async (...args: Parameters<typeof fetch>) => {
    let response: Response;
    try {
      response = await inner(...args);
    } catch (error) {
      // A request the harness cancelled is not an observation of the system.
      if (!signal.aborted && (error as { name?: string })?.name !== 'AbortError')
        record({ status: 0 });
      throw error;
    }
    if (response.status >= 200 && response.status < 300) return response;
    const status = response.status;
    const read: Promise<void> = response
      .clone()
      .text()
      .then(
        body => record({ status, ...codeOf(body) }),
        () => record({ status })
      )
      .finally(() => pending.delete(read));
    pending.add(read);
    return response;
  }) as typeof fetch;
}

function codeOf(body: string): { code?: string } {
  const code = extractApiErrorCode(body);
  return code ? { code } : {};
}
