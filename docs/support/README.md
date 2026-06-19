# Support Documentation

Internal reference for a one-person support operation. These docs are the ops layer — not customer-facing guides. They answer: what do I ask first, where do I look, what do I say, and how do I investigate it.

**These docs are NOT gated on UI stability.** They depend on the support workflow, not screenshots, and are needed from the first real user onward.

**Public-repo safety:** This repository is public. Every file here is world-readable. Never include customer PII, credentials, secrets, RLS-bypass techniques, or production account data. Use role names and placeholder links — not personal contact details or escalation secrets. See the [Sensitive Content Rules](../plans/2026-06-12-user-documentation-support-plan.md#sensitive-content-rules-public-repository) in the plan.

---

## Support Operating Model

Goal: Richard can answer any common launch question by sending a link or macro rather than rewriting the answer each time.

| Question type | Best artifact | Target time |
|---|---|---|
| "How do I do this?" | KB article or user-guide section | Send a link in < 1 min |
| "What does this mean?" | Short KB explainer | Send a link in < 1 min |
| "I got an error saying…" | Error inventory entry → KB article or macro | Resolve or escalate in < 5 min |
| "I am stuck right now (show day)" | Support macro + triage runbook | Secretary unblocked in < 2 min |
| "Can you train our club?" | Slide deck + printable quickstart | No repeat answer needed |

Two lookup paths must always work: by task ("how do I check in a dog") and by symptom ("entry not showing" or a quoted error string).

---

## Files

| File | Status | Purpose |
|---|---|---|
| [intake-template.md](intake-template.md) | `planned` | Universal "what to ask first" checklist + intake macro |
| [error-message-inventory.md](error-message-inventory.md) | `planned` | Verbatim error/toast/status strings mapped to answers |
| [question-bank.md](question-bank.md) | `source-mapped` | Common questions, answer owner, and target artifact |
| [common-issues-outline.md](common-issues-outline.md) | `planned` | Troubleshooting taxonomy by symptom, role, and workflow |
| [investigation-cookbook.md](investigation-cookbook.md) | `planned` | Per-symptom admin recipes: Supabase queries, Stripe paths |
| [macros.md](macros.md) | `planned` | Reusable reply snippets for email, chat, and phone |
| [show-day-triage-outline.md](show-day-triage-outline.md) | `planned` | Outline for the live show-day support runbook |

### Graduated to final (create when outline is verified)

| File | Status | Purpose |
|---|---|---|
| [common-issues.md](common-issues.md) | `planned` | Final troubleshooting doc grown from outline |
| [show-day-triage.md](show-day-triage.md) | `planned` | Final support runbook for live show-day issues |

---

## Priority Order for Authoring

1. `question-bank.md` — already `source-mapped`; seed from existing UX audit findings
2. `intake-template.md` — needed from first support interaction
3. `error-message-inventory.md` — grep the codebase; the most unique agent-native task
4. `macros.md` — draft the first 10 macros covering the highest-priority questions
5. `investigation-cookbook.md` — write per-symptom recipes for the top 10 issues
6. `common-issues-outline.md` — organize by symptom, link to cookbook + macros
7. `show-day-triage-outline.md` — secretary show-day specific; draft before first live show

---

## Repeating Loop

Every time a question is answered for a real user:
1. Is there a macro for it? If not, add one to `macros.md`.
2. Is there a KB article to point them to? If not, add a stub to `../knowledge-base/`.
3. Did the investigation require a custom DB query or Stripe path? Add it to `investigation-cookbook.md`.
4. Was the question triggered by a confusing UI string? Add to `error-message-inventory.md` and consider a backlog item.
