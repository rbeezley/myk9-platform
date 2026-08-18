# Support triage agent

Runs every 15 minutes on GitHub Actions. Reads the open support queue, drafts replies,
and emails them to the operator. Design rationale:
[`docs/plan-ai-support-triage.md`](../../docs/plan-ai-support-triage.md).

## What it will and will not do

- It **never** composes free text that gets sent to an exhibitor. On the auto-send path
  the model's entire output is an answer id from `answers.ts`, constrained by a JSON
  schema enum and re-validated locally.
- It **never** auto-sends on a payment/refund question, a show-day-priority ticket, or a
  ticket where the exhibitor already replied to an operator answer. Those tickets skip
  the model entirely and get a reason-only email.
- The carve-out is re-checked against a fresh read of the thread immediately before
  sending, so a trigger that arrives mid-pass still blocks the send.
- The send itself is a single database statement
  (`support_triage_send_operator_reply`) gated on the id of the exhibitor message it
  answers. A reply that arrives after the agent's read — from a second worker or from
  you, in the inbox — makes the insert match nothing, so the agent no-ops instead of
  duplicating. Resolving the ticket also blocks it.
- It sends at most 3 auto-replies per pass. Exceeding that sends nothing further and
  emails you that the cap engaged.
- `CANNED_ANSWERS` starts empty, so today it auto-sends nothing at all — every ticket
  produces a draft email and nothing reaches an exhibitor.
- It interrupts you only for a cluster (3+ tickets awaiting a reply on one show within an
  hour). There is no daily digest.

## Promoting an answer

1. Watch for the same **Topic** line recurring across draft emails.
2. Once it has recurred 3+ times and your edits to the draft have stopped changing much,
   add an entry to `CANNED_ANSWERS` in `answers.ts` with `autoSend: false`.
3. Let it ride for a few more occurrences. When the drafts still look right, flip
   `autoSend: true`.

`whenToUse` is shown to the model; `reply` never is. Write `whenToUse` to describe the
_question_, not the answer.

## Known gap

`isPaymentOrRefundQuestion` (shared with the in-app deflection layer) is a keyword regex,
not semantic. Phrasings that avoid those keywords — "can I get my money back" — are not
caught by the payment carve-out. Pinned by a regression test in `carveOuts.test.ts`.
This is inert while `CANNED_ANSWERS` is empty; revisit before promoting the first answer.

One window remains after [MYK9-135](https://linear.app/myk9-platform/issue/MYK9-135/support-triage-auto-send-make-the-send-guard-atomic):
the conditional insert reads a snapshot taken when its statement begins, so an inbox
reply that commits during that statement is not seen. Concurrent triage workers are
serialised by a row lock and are fully covered; closing the human window as well would
mean routing the inbox's own writes through the same lock. Worth doing only if a
duplicate is ever actually observed.

## Required GitHub secrets

Four to add. Two more values the workflow needs are already covered.

| Secret                      | Status      | Value                                                                                |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`         | **add**     | Anthropic API key.                                                                   |
| `RESEND_API_KEY`            | **add**     | The same Resend key the edge functions use.                                          |
| `SUPPORT_OPERATOR_EMAIL`    | **add**     | Where drafts and cluster alerts go.                                                  |
| `SUPPORT_OPERATOR_USER_ID`  | **add**     | The `auth.users.id` auto-sent messages are attributed to.                            |
| `SUPABASE_SERVICE_ROLE_KEY` | already set | Service-role key. Bypasses RLS — this workflow is the only consumer.                 |
| `VITE_SUPABASE_URL`         | already set | Reused as `SUPABASE_URL`; a second secret holding the same value drifts on rotation. |

```bash
gh secret set ANTHROPIC_API_KEY
```

Two further values are **deliberately not secrets** — they are plain `env:` entries in
`.github/workflows/support-triage.yml`, so the workflow is readable without console
access:

- `SUPPORT_TRIAGE_FROM_EMAIL` — `notifications@myk9show.com`, the sender already verified
  in Resend and used by the existing edge functions.
- `MYK9_APP_URL` — `https://myk9show.com`, used only to build ticket deep links.

Until every secret exists, each scheduled run fails fast and emails nothing.

## Commands

```bash
pnpm support:triage:test        # unit tests
pnpm support:triage:typecheck   # types — `pnpm typecheck` does NOT cover scripts/
pnpm support:triage             # one real pass (needs the env vars above)
```

## First live check

1. Trigger the workflow manually (`workflow_dispatch`).
2. Open a test ticket from an exhibitor account.
3. Confirm a draft email arrives and **no** message appeared in the exhibitor's thread.

Step 3 is the one that matters: with `CANNED_ANSWERS` empty, any message reaching an
exhibitor means the auto-send guard is broken.
