/**
 * One rule for resolving a fixture account's email from the environment.
 *
 * This exists because two callers disagreed and the disagreement was invisible.
 * `testUsers.ts` used `??` while `e2eAuthPreflight.ts` used `||`, and an unset
 * GitHub secret is not undefined — `${{ secrets.FOO }}` interpolates to an
 * EMPTY STRING. So the preflight fell back to the canonical address and
 * reported the credentials healthy, while Playwright kept the empty string and
 * signed in as ''. A green preflight followed by an auth failure is the exact
 * false negative the preflight exists to prevent (Codex, #1889).
 *
 * Both callers now route through here, so they cannot drift apart again: the
 * semantics live in one function rather than in two operators that look
 * interchangeable and are not.
 *
 * A blank override is treated as absent on purpose. It carries no intent — no
 * one means "sign in as nobody" — and the alternative, failing on blank, would
 * break the common case of a workflow mapping an optional secret that has not
 * been created yet.
 */
export function resolveFixtureEmail(
  override: string | undefined,
  seededAddress: string
): string {
  const trimmed = override?.trim();
  return trimmed ? trimmed : seededAddress;
}
