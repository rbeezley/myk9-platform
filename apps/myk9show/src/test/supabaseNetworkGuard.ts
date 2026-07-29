const HOSTED_SUPABASE_SUFFIX = '.supabase.co';

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input, 'https://vitest.invalid');
  return new URL(input.url, 'https://vitest.invalid');
}

export function createSupabaseNetworkGuard(delegate: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = requestUrl(input);

    if (url.hostname.endsWith(HOSTED_SUPABASE_SUFFIX)) {
      throw new Error(
        `[test isolation] Ordinary test attempted hosted Supabase access ` +
          `(host: ${url.hostname}). Mock the request or use the explicitly gated ` +
          `Playwright/load workflow for remote end-to-end coverage.`
      );
    }

    return delegate(input, init);
  };
}
