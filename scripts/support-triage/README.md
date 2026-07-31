# Support triage agent

Runs every 15 minutes on GitHub Actions. Reads the open support queue, drafts replies,
and emails them to the operator. Design rationale:
[`docs/plan-ai-support-triage.md`](../../docs/plan-ai-support-triage.md).

## What it will and will not do

- It **never** composes free text that gets sent to an exhibitor. On the auto-send path
  the model's entire output is an answer id from `answers.ts`, constrained by a JSON
  schema enum and re-validated locally.
- It **never** auto-sends on a payment/refund question, a show-day-priority ticket, or a
  ticket where the exhibitor already replied to an operator answer.
- It sends at most 3 auto-replies per pass. Exceeding that sends nothing further.
- `CANNED_ANSWERS` starts empty, so today it auto-sends nothing at all — every ticket
  produces a draft email and nothing reaches an exhibitor.
- It interrupts you only for a cluster (3+ open tickets on one show within an hour).
  There is no daily digest.

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

## Required GitHub secrets

| Secret                      | Value                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | `https://sojmvhhwsjxmfistvzbe.supabase.co`                                        |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key. Bypasses RLS — this workflow is the only consumer.              |
| `ANTHROPIC_API_KEY`         | Anthropic API key.                                                                |
| `RESEND_API_KEY`            | The same Resend key the edge functions use.                                       |
| `SUPPORT_OPERATOR_USER_ID`  | The `auth.users.id` that auto-sent messages are attributed to.                    |
| `SUPPORT_OPERATOR_EMAIL`    | Where drafts and cluster alerts go.                                               |
| `SUPPORT_TRIAGE_FROM_EMAIL` | A verified Resend sender.                                                         |
| `MYK9_APP_URL`              | Base URL for ticket deep links, e.g. `https://myk9-platform-myk9show.vercel.app`. |

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
