/**
 * Guard against signing in with an address on a retired fixture domain.
 *
 * `testUsers.ts` defaults every fixture email to a live `@myk9t.com` address,
 * so a MISSING env override is harmless. A STALE one is not: `??` only fires on
 * undefined, so a leftover `E2E_JUDGE_EMAIL=e2e-judge@test.myk9.com` in
 * `.env.local` (or in a GitHub secret) beats the correct default and signs in
 * as nobody.
 *
 * `test.myk9.com` was retired on 2026-08-23 — it has no MX record, so mail to
 * it hard-bounced off a third party's server — and holds zero `auth.users`
 * rows (re-verified 2026-08-30: 22 users on `@myk9t.com`, none on
 * `test.myk9.com`). Supabase answers a nonexistent address with
 * `Invalid login credentials`, byte-identical to what a wrong password gives,
 * so the failure reads as rotation drift and sends you to reset a password
 * that was never wrong. It cost a debugging session on 2026-08-29.
 *
 * Naming the cause is the entire point: the real reason is unrecoverable from
 * the error Supabase returns, so this throws before the request is made.
 *
 * This lives outside `e2e/` on purpose. `vitest.config.ts` excludes
 * `**\/e2e\/**`, so a test colocated with `testUsers.ts` would never run — the
 * hand-maintained-allowlist trap. Keeping the rule in a playwright-free module
 * means it is unit-testable at all.
 */

/** Fixture domains that no longer have auth users, with the date each died. */
const RETIRED_FIXTURE_DOMAINS: ReadonlyMap<string, string> = new Map([
  ['test.myk9.com', '2026-08-23'],
]);

export function retiredDomainOf(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  return RETIRED_FIXTURE_DOMAINS.has(domain) ? domain : null;
}

export function assertAddressIsLive(email: string): void {
  const domain = retiredDomainOf(email);
  if (!domain) return;

  throw new Error(
    `E2E sign-in aborted: "${email}" is on the retired ${domain} domain ` +
      `(retired ${RETIRED_FIXTURE_DOMAINS.get(domain)}), which has no auth.users rows and ` +
      `can never authenticate. Supabase would report this as "Invalid login credentials", ` +
      `which looks like a wrong password. The cause is a stale E2E_*_EMAIL override in ` +
      `.env.local or a GitHub Actions secret: remove it and the @myk9t.com default in ` +
      `testUsers.ts applies. See apps/myk9show/.env.example.`
  );
}
