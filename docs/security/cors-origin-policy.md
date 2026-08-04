# Edge CORS origin policy

Status: accepted INFO-level hardening decision for SA-2026-07-29-05 / MYK9-150.

## Origin contract

The deployed root Edge Functions use these browser-origin classes:

| Class             | Allowed origins                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production        | `https://myk9show.com`, `https://www.myk9show.com`, `https://app.myk9show.com`                                                                                     |
| Shared staging    | `https://myk9-platform-myk9show.vercel.app`                                                                                                                        |
| Preview           | `https://myk9-platform-myk9show-<deployment>-<team>.vercel.app`, constrained by the anchored project-specific pattern in `supabase/functions/_shared/http/cors.ts` |
| Local development | `http://localhost:5173`, `http://localhost:5174`                                                                                                                   |

The myK9Q passcode function has a separate allowlist for its production, staging,
and local origins. It shares the helper but does not inherit myK9Show's dynamic
preview rule because that rule is enabled only when the myK9Show staging origin
is present in the supplied list.

An origin that is not accepted is never reflected. The helper returns the first
canonical origin as a safe fallback, which causes a browser request from the
untrusted origin to fail the browser's origin comparison.

## Accepted preview risk and assumptions

Vercel preview URLs are deployment-specific, so maintaining an exact list would
require coordinating every preview deployment with the shared Supabase Edge
Function environment. The accepted INFO-level decision retains the dynamic
preview workflow and bounds it to HTTPS hostnames with the exact myK9Show
project prefix and `vercel.app` suffix. The contract tests cover allowed
origins and malicious lookalike suffixes, protocols, ports, and paths.

This decision depends on the current authentication architecture:

- protected browser calls carry bearer authorization headers;
- the root deployed Edge Functions do not emit `Access-Control-Allow-Credentials`
  or set browser cookies; and
- CORS is not an authorization boundary for direct server-side callers.

If a browser path starts using credential-bearing cookies, it requires a separate
security review and this accepted-risk decision no longer closes that path.

## Scope

The policy applies to deployed functions under the root `supabase/functions/`
directory. The app-local `apps/myk9show/supabase/functions/` directory contains
legacy and experimental references, not the deployed Edge Function source.
Functions that are server-to-server webhooks omit CORS. The two AskQ entrypoints
use their existing single `ALLOWED_ORIGIN` value rather than the shared dynamic
preview rule.
