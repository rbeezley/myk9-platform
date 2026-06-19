# Support Intake Template

The goal of intake is to collect enough information in one exchange to route and investigate without a second round of back-and-forth. Incomplete intake is the single biggest source of slow resolutions.

---

## Universal Intake Checklist

Collect every field before beginning investigation. Skip fields that are obviously irrelevant (e.g., "which show" for a sign-in question).

| Field | What to collect | Why it matters |
|---|---|---|
| Name | First name, preferred contact name | Personalization, not a formal record |
| Email address | The address they use to sign in | Looks up auth.users, entries, Stripe customer |
| Role | Secretary / Exhibitor / Club admin / Treasurer / Judge | Determines which surface and which tables to check |
| Club or show | Club name or show name and date | Scopes the Supabase query |
| Page they were on | The page title they saw, not a URL | Non-technical users cannot read URLs |
| What they were trying to do | One sentence: "I was trying to…" | Distinguishes "couldn't see" from "couldn't do" |
| Exact error text | Word for word — screenshot if possible | Entry point for error-message inventory lookup |
| Device and browser | iPhone/Android/Mac/PC; Chrome/Safari/Firefox | Distinguishes PWA offline vs desktop issues |
| Online or offline | Were they at the show with spotty signal? | Flags sync issues vs data issues |
| When it happened | Date and approximate time | Correlates to Stripe webhook events, DB timestamps |

---

## Offline-First Specifics

The app is designed to work at dog show venues where connectivity is unreliable. Standard support questions about "not loading" or "data missing" may have two different root causes — ask these before assuming a bug:

**Questions to ask without using jargon:**

- "Were you at the show venue when this happened, or at home?"
- "Did the app show a banner or message about being offline or out of sync?"
- "Were other people at the show having the same problem, or just you?"
- "Did the information appear later once you got back to a better signal?"

**How to interpret the answers:**

| Answer pattern | Likely cause | Investigation starting point |
|---|---|---|
| At the venue, banner showed | Sync fallback triggered | Check sync state; data will appear once online |
| At home, banner showed | Stale PWA cache or offline DB | Cache clear, reload (KB: `offline-mode.md`) |
| Others had same problem | Server-side issue or Supabase outage | Check Supabase status + server logs |
| Just one user, at venue | Device connectivity or IndexedDB state | Device-level troubleshooting first |
| Data appeared later | Expected offline-first behavior | No action needed; explain the model |

---

## Ready-to-Send Macros

Use these verbatim. Replace fields in `[brackets]`.

### Email variant — M-01

```
Subject: Quick questions about your issue with myK9Show

Hi [Name],

Thanks for reaching out. To look into this quickly, I need a few details:

1. What email address do you use to sign in?
2. What is the name of the show or club this is about?
3. Which page were you on when the problem happened? (The page title you saw, not the URL.)
4. What were you trying to do — one sentence is enough.
5. What did the app say, word for word? A screenshot is even better if you have one.
6. What device and browser are you using? (iPhone, Android, Mac, PC — and Chrome, Safari, Firefox, etc.)
7. Were you at the show venue when this happened, or at home?

Once I have these, I can usually sort things out quickly.

[Your name]
myK9Show support
```

### Text / short-form variant — M-01b

```
Hi [Name] — to look into this I need: the email you sign in with, the show name and date, which page you were on, exactly what it said on screen, and your device (iPhone / Android / Mac / PC). Screenshot is great if you have one. Was this at the venue or at home?
```

---

## Intake Field → Investigation Starting Point

Once intake is complete, route to the right recipe in `docs/support/investigation-cookbook.md`.

| Intake finding | Investigation starting point |
|---|---|
| "I paid but entry not showing" | Cookbook: Payment processed, entry missing |
| "I never got a confirmation email" | Cookbook: Confirmation email not received |
| "It says my entry is Pending" | KB: `entry-status.md` (usually no action needed) |
| "I can't log in" | Cookbook: Cannot sign in |
| "Payout didn't arrive" | Cookbook: Club payout missing |
| "Stripe is asking for my info" | Macro M-08; KB: `stripe-onboarding.md` |
| "App says offline" | KB: `offline-mode.md`; Cookbook if persists |
| Error text quoted verbatim | Error-message inventory → `docs/support/error-message-inventory.md` |
| Secretary: any show-day issue | Show-day triage runbook: `docs/support/show-day-triage-outline.md` |
