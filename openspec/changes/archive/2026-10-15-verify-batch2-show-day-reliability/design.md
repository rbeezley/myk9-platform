# Design

## Context

The full criteria and prior proof are recorded in Linear and docs/qa/batch2-show-day-verification.md. Shared read-only preparation passed in #3047. The owner now explicitly authorizes the remaining proof in an isolated environment, with closure conditional on complete passing evidence.

## Goals / Non-Goals

Goals: preserve real browser auth/queue/SQL boundaries, prove the two issues, and keep all shared application data unchanged. Preserve judge rhythm, secretary reliability and truthful exhibitor queue text.

Non-goals: production deployment/data, new product UI, modified JWT policy, live payments/messages or a synthetic replacement for the natural expiry interval.

## Decisions

1. Use the existing `qa:isolated-e2e:prepare` lifecycle on a fresh GitHub Actions VM. It starts/reset/seeds local Supabase and exports matching loopback build/API configuration. Reuse the canonical show-day seed and its assigned judge/Willow/Cooper entries; changing those rows is allowed only in this disposable database. Do not use the prior shared fixture IDs as a write target.
2. Fail closed before mutations with `resolveIsolatedE2eTarget`: only local allowlisted project, matching build/API loopback origins. Use runner-generated passwords, no shared Supabase/Stripe/email credentials. Block browser external HTTP requests and container public egress. Use native WebSockets derived from the verified loopback build configuration, assert every observed socket URL is loopback, and count received frames across the offline interval; do not proxy sockets through Node. Service workers are disabled in this suite so they cannot bypass Playwright routing. This covers an already-loaded scoring page, not offline cold boot/PWA cache behavior.
3. Add a dedicated manual workflow/config rather than adding 61 minutes to both ordinary regression passes. The PR runs the new workflow against its exact source, with concurrency keyed by source SHA and cancellation disabled; future workflow_dispatch can repeat it. The existing schedule is untouched. Cleanup always stops the disposable target; never deploy anything.
4. Fixture setup uses service-role writes to this local target only. Set high/gapped or NULL run_order and actual check-in/score states, then use fresh role browser contexts and real reads. A ringside pulled check-in state is distinct from withdrawn/scratched entry lifecycle filtering. Scope every state/no-raw-number assertion to Willow’s actual row. Verify 1/2 positions in the real hand-placement list and terminal rows in its read-only sections without choosing any mutation. Test pending/place text and state-only controls without inventing a second queue ordering rule.
5. Preload the real judge scoresheet, record source SHA/session identity/expiry and server baseline, go truly offline with context.setOffline, wait at least61 real minutes using a monotonic timer, then score through UI. Prove the local row and queue owner, server unchanged while offline, then reconnect and verify same-user refresh/upload, final values and empty queue. No intercepted success, mocked session, artificial expiry or clock is accepted as this proof. Existing engine controls cover different-owner hold and no-owner refusal.
6. Preserve only synthetic evidence with credentials scrubbed and verified before upload; no traces/videos or auth state artifacts. Keep incomplete tasks and failures truthful. Close only after full criteria pass and reviewed/green harness is merged. Archive only after passing verification, merge and tracker closure; never because the earlier preparation PR merged.

## Risks / Trade-offs

- New isolation setup can fail before tests → report setup versus product failures distinctly and retain diagnostics; do not mark a skipped/undiscovered test passing.
- Natural expiry takes time →120-minute job budget,75-minute test budget, progress each minute, no retries. Earlier failed attempts are not passing evidence.
- Queue upload can fail → capture durable queue and server state before teardown; the disposable VM prevents shared residue. Never infer upload from an optimistic label.
- Latest main may change → record exact source and merge base, integrate relevant changes before final review and preserve unrelated work.

## Migration Plan

No migration/deployment to shared infrastructure. Only the disposable runner applies existing migrations/seeds. On any product defect, obtain assertion-first coverage, use appropriate full validation and independent review, then release only through the existing authorized workflow. The verification harness itself ships through PR/review/CI/merge.
