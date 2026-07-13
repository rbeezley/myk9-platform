## Context

The strict July 12 Edge Function audit downloaded every production function into isolated roots.
`stripe-upgrade-subscription` alone included a shared `premiumPrices.ts` that matched no Git
commit (SHA-256 `34a1496ee5ade91c44766595e401b0c513eca03725549463f6c71f77d9c2b88e`). Its
`parsePremiumPriceIds` returns configured IDs *instead of* fallback IDs whenever the secret is
non-empty. Repository source and its existing pure Vitest contract use fallback extension and
deduplication, so a sandbox-only secret cannot demote recognized live subscribers.

This is a payment-source recovery decision, not a user-facing or show-day data-flow change. It
does not affect replication, offline work, routes, components, or role-specific UX intent.

## Goals / Non-Goals

**Goals:**

- Make the reviewed repository fallback-extension behavior the recorded source of truth.
- Preserve a focused executable contract that catches a future replacement regression.
- Make the approved-but-not-yet-executed deploy and rollback proof explicit in operational records.
- Keep Phase 0.4 and Phase 3 blocked until their separate shared-system gates have real evidence.

**Non-Goals:**

- Reconstruct the unknown provenance of the production-only helper beyond its captured fingerprint
  and behavior.
- Deploy a function, alter `PREMIUM_PRICE_IDS`, contact Stripe, or perform a payment smoke.
- Change checkout, webhook, subscription, or product-price business behavior.

## Decisions

### 1. Repository fallback-extension semantics are authoritative

`parsePremiumPriceIds` will continue to return a de-duplicated union of hardcoded live fallback
IDs and configured IDs. The focused test already states the important safety property: a
sandbox-only configuration cannot remove live price recognition.

Alternative: keep the deployed replacement semantics. Rejected because a non-empty sandbox-only
secret then removes known live price IDs from the subscription tier calculation.

Alternative: treat production source as authoritative because it is live. Rejected because the
audit established that it has no recoverable repository provenance and its behavior contradicts the
reviewed regression contract.

### 2. Evidence is a source decision, not a silent catch-up deploy

The recovery records the live SHA, recovered behavior, selected source, focused test command,
planned deployment command, and manual rollback source. It explicitly does not mark the function
as deployed or close the broader helper-batch gate.

Alternative: deploy immediately after local verification. Rejected because Supabase function
deployment is a shared-system mutation and could change a live subscriber's tier interpretation;
it requires a separate explicit approval and post-deploy verification.

### 3. Extend the existing Phase 3 preflight contract

The Phase 3 Stripe cutover capability gains an additive requirement for source-recovery evidence
when an audit finds a deployed-ahead premium price helper. This keeps the decision discoverable in
the canonical go-live contract instead of only in an incident-style audit note.

Alternative: add a new capability. Rejected because this is an additional Phase 3 preflight gate,
not a new product behavior.

## Risks / Trade-offs

- A later edit changes extension to replacement → the pure unit test fails; keep it colocated with
  the shared helper and run it before reviewing/deploying the function.
- A deploy fails or changes bundle contents unexpectedly → use the recorded exact function command,
  compare the downloaded post-deploy helper, and redeploy the pre-deployment repository revision if
  rollback is required.
- The secret contains malformed IDs → existing trim/filter behavior ignores blanks; price IDs remain
  recognized only when explicitly present in fallback or configuration.
- A repo-ahead helper batch is confused with this decision → retain separate tasks and require
  explicit approval for each deployment batch.

## Migration Plan

1. Land source decision, regression evidence, and operator instructions through review.
2. After a separate explicit approval, deploy only `stripe-upgrade-subscription` with the existing
   project reference and `--no-verify-jwt --use-api`; do not combine it with the unrelated four-
   function helper catch-up batch.
3. Download the deployed function into an isolated directory; verify the helper matches repository
   fallback-extension source and run a fail-closed non-mutating price-recognition smoke using the
   configured production secret context only if approved.
4. If post-deploy evidence is wrong, redeploy the last known repository bundle only after confirming
   the intended rollback revision and operator approval. Never restore the unknown live-only helper.

## Open Questions

- None for source recovery. Function deployment and any production secret-context smoke remain
  explicit operator approvals.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: the runtime semantics govern premium subscription recognition in a production Stripe
  Edge Function, even though this slice intentionally makes no production deployment.
