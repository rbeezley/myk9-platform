# Support Question Bank

Common customer questions, seeded from UX journey audit findings, payment walkthrough notes, and expected first-club interactions. Use this as the master list for building macros, KB articles, and investigation-cookbook recipes.

**Column definitions:**
- **Question** — written in the customer's own words, including phrases they actually say
- **Role** — who asks this
- **Trigger** — what causes the question
- **Priority** — `high` (volume or stress level), `medium`, `low`
- **Target artifact** — what we point them to (KB article, macro, guide section, backlog item)
- **Workflow readiness** — whether the underlying app flow is stable enough to document

---

## The First 25 (most likely at launch)

### Secretary Questions

| # | Question | Role | Priority | Target artifact | Workflow readiness |
|---|---|---|---|---|---|
| S-01 | "How do I create a show?" | Secretary | high | KB: `create-a-show.md`, Secretary Guide § Setup | stable |
| S-02 | "How do I add classes to a trial?" | Secretary | high | Secretary Guide § Setup (wizard step 3) | stable |
| S-03 | "How do I approve an entry?" | Secretary | high | KB: `approve-entries.md`, Secretary Guide § Entry Management | stable |
| S-04 | "How do I add a mail-in entry?" | Secretary | high | Secretary Guide § Entry Management | stable |
| S-05 | "How do I record payment for a check I received?" | Secretary | high | Secretary Guide § Entry Management | stable |
| S-06 | "How do I print scoresheets before the show?" | Secretary | high | KB: `print-scoresheets.md`, Secretary Guide § Reports | stable |
| S-07 | "How do I handle a scratch on show day?" | Secretary | high | KB: `handle-a-scratch.md`, Secretary Guide § Show Day | stable |
| S-08 | "How do I handle a move-up?" | Secretary | high | KB: `handle-move-up.md`, Secretary Guide § Show Day | stable |
| S-09 | "How do I submit results to AKC?" | Secretary | high | KB: `submit-akc-results.md`, Secretary Guide § Closeout | stable |
| S-10 | "How do I release results so exhibitors can see them?" | Secretary | high | Secretary Guide § Closeout → Results Control | stable |
| S-11 | "How do I print result labels for the ribbons?" | Secretary | medium | Secretary Guide § Reports | stable |
| S-12 | "The entry count on the dashboard doesn't match the Entry Management page" | Secretary | medium | KB: `entry-count-mismatch.md` → macro | stable (known root cause) |
| S-13 | "How do I add a late entry / walk-in on show day?" | Secretary | high | Secretary Guide § Show Day | stable |
| S-14 | "How do I send a message / announcement to all exhibitors?" | Secretary | medium | KB: `send-announcement.md` | stable |

### Exhibitor Questions

| # | Question | Role | Priority | Target artifact | Workflow readiness |
|---|---|---|---|---|---|
| E-01 | "How do I enter a show?" | Exhibitor | high | KB: `enter-a-show.md`, Exhibitor Guide § Entry | stable |
| E-02 | "I paid but I can't see my entry anywhere" | Exhibitor | high | KB: `entry-not-showing.md`, macro M-03 | stable (webhook delay — known) |
| E-03 | "My entry says Pending — did it go through?" | Exhibitor | high | KB: `entry-status.md` | stable |
| E-04 | "How do I add a dog to my account?" | Exhibitor | high | KB: `add-a-dog.md` | stable |
| E-05 | "How do I check in on show day?" | Exhibitor | high | KB: `check-in.md` | stable |
| E-06 | "Where do I see my results?" | Exhibitor | high | KB: `view-results.md` | stable |
| E-07 | "I can't log in / I forgot my password" | Exhibitor | high | KB: `cant-sign-in.md` | stable |
| E-08 | "The app says Offline — is something wrong?" | Exhibitor | medium | KB: `offline-mode.md` | stable |
| E-09 | "Where do I see the run order?" | Exhibitor | high | KB: `find-run-order.md` | stable |
| E-10 | "How do I see what I paid?" | Exhibitor | medium | KB: `my-payments.md` | stable |

### Club / Treasurer Questions

| # | Question | Role | Priority | Target artifact | Workflow readiness |
|---|---|---|---|---|---|
| T-01 | "How do we set up to receive payments from our shows?" | Treasurer | high | `docs/operations/stripe-treasurer-guide.md`, KB: `stripe-onboarding.md` | stable — treasurer guide already written |
| T-02 | "When will we get paid for the show?" | Treasurer | high | KB: `payout-timing.md`, `docs/operations/stripe-treasurer-guide.md` | stable |
| T-03 | "Stripe is asking for my SSN / bank info — is this normal?" | Treasurer | high | Macro M-08, KB: `stripe-onboarding.md` | stable — identity verification is Stripe standard |

---

## Extended Question List (beyond first 25)

### Secretary — deeper questions

| # | Question | Trigger | Priority | Notes |
|---|---|---|---|---|
| S-15 | "How do I put someone on the waitlist?" | Class fills | medium | Entry Management tab switch |
| S-16 | "How do I offer a waitlist spot when someone scratches?" | Scratch creates opening | medium | Waitlist Management → Offer Spot |
| S-17 | "How do I reorder the run order?" | Pre-show setup | medium | Show Desk → Show Map drag |
| S-18 | "How do I assign rings to classes?" | Setup | medium | Show Setup page |
| S-19 | "How do I delete a show / trial / class I created by mistake?" | Setup | low | Show Setup delete affordances |
| S-20 | "How do I close out the show and archive it?" | Closeout | medium | Show Desk — close show action |
| S-21 | "The AKC XML won't generate / is missing dogs" | AKC submission | high | Missing AKC registration numbers → preflight warning |
| S-22 | "How do I generate the Judge Certification report?" | Closeout | medium | Reports page → Judge Report |
| S-23 | "How do I add a judge or official after the show is created?" | Setup | medium | Show Setup → edit officials |
| S-24 | "How do I edit entry fees after publishing the show?" | Post-publish | low | Show Setup — status and fee fields |
| S-25 | "Where do I see entries for just one class?" | Show day | medium | Entry Management → class filter |
| S-26 | "An exhibitor says they paid but I don't see a payment" | Payment | high | Investigation: Stripe dashboard → stripe_orders table |
| S-27 | "How do I mark a dog absent (no-show) without scratching?" | Show day | medium | Show Map → Pull / no-show action |

### Exhibitor — deeper questions

| # | Question | Trigger | Priority | Notes |
|---|---|---|---|---|
| E-11 | "I entered the wrong class — can I change it?" | Post-entry | high | Post-entry class change is secretary-only; guide them to message the secretary |
| E-12 | "How do I enter more than one dog?" | Registration wizard | medium | Dog picker supports multi-dog |
| E-13 | "My result says NQ — what does that mean?" | Results | medium | KB: `qualifying-codes.md` |
| E-14 | "I got a Q — does it count toward my title?" | Results | medium | KB: `title-progress.md` |
| E-15 | "Where do I see my dog's title progress?" | Analytics | low | `/exhibitor/analytics` |
| E-16 | "The show I want to enter says Closed — can I still get in?" | Closed entry window | medium | Contact secretary / waitlist |
| E-17 | "I need to withdraw my entry — how do I do that?" | Pre-show | medium | Message show team → secretary handles pull |
| E-18 | "I got a refund — where do I see it?" | Withdrawal | medium | My Payments page |
| E-19 | "The app isn't loading / is very slow" | Tech support | medium | Cache clear, connection check |
| E-20 | "I can't find the show I entered" | My Shows | medium | My Shows search / filter or direct link |

### Treasurer / Club Admin — deeper questions

| # | Question | Trigger | Priority | Notes |
|---|---|---|---|---|
| T-04 | "Stripe says our account is under review — what do we do?" | Payout delay | high | Macro M-09; investigation: Stripe Connect dashboard account status |
| T-05 | "We didn't receive our payout — where did it go?" | Payout | high | Investigation: stripe_orders → show_payouts, Stripe dashboard transfers |
| T-06 | "A club member needs to be removed from our account" | Admin | low | Club admin → Members page |
| T-07 | "How do we update our bank account info in Stripe?" | Payout | medium | Stripe Express dashboard (direct) |
| T-08 | "Can we charge a different entry fee for our shows vs. others?" | Config | low | Per-show fee is Secretary setup; platform-wide rate is admin-only |
| T-09 | "What does the platform fee cover?" | Onboarding | medium | KB: `platform-fee.md` |
| T-10 | "We did a refund — how does that affect our payout?" | Refund | medium | KB: `refunds-and-payouts.md` |

---

## Questions That Need Product Fixes (not documentation)

These questions cannot be answered with a macro or KB article because the underlying situation is a known product gap. File these as backlog items rather than documenting a workaround.

| # | Question | Root cause | Status |
|---|---|---|---|
| P-01 | "I entered a show but never got a confirmation email" | Registration email delivery depends on Resend API key being set | Active — email not wired for all paths |
| P-02 | "My entry shows a registration number as Pending even after I withdrew" | `MyEntryCard` shows "Registration #Pending" even for terminal-state entries | Open backlog: `OPEN-TODOS.md` P1-04w-1 |
| P-03 | "The refund date says 'just now' but I withdrew months ago" | `formatRelativeTime` returns "just now" for future-dated seed timestamps | Open backlog: `OPEN-TODOS.md` P1-04w-2 |
| P-04 | "Exhibitor can see their own result before the secretary releases it" | RLS gap: authenticated own-entry read bypasses the results-release gate | Open backlog: Pre-Launch Housekeeping |

---

## Metadata: Source and Coverage

Seeded from:
- `docs/audits/2026-06-ux-journeys/` (June 2026 UX Journey Audit findings)
- `docs/audits/2026-06-ux-journeys/04-secretary-rewalk-2026-06-17.md` (secretary re-walk)
- `docs/operations/stripe-treasurer-guide.md` (payment walkthrough notes)
- `docs/plans/2026-06-12-user-documentation-support-plan.md` § Phase 1 Task 4
- `OPEN-TODOS.md` (open P1-04w-* findings)
- General domain knowledge: AKC Scent Work show-day operations

Last reviewed: 2026-06-19
