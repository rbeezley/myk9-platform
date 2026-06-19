# Knowledge Base

Customer-facing help articles. These are public, task-specific answers organized by what the customer says, not by internal feature names.

**Delivery (interim):** rendered GitHub links — point customers directly to raw markdown files in this directory. Works on day one.

**Delivery (at launch):** a static docs site at `help.myk9show.com` built from this directory. The frontmatter in every article feeds the site automatically — `aliases` become search keywords, `audience` drives role-based nav, `last-verified` renders as a per-page trust signal.

**No duplicated content.** Link to user-guide sections (`../user-guides/`) instead of copying steps. KB articles answer one question short; guides cover a whole workflow.

---

## Article Categories

| Category | Audience | Examples |
|---|---|---|
| Getting started | All | "How to create an account", "How to add a dog" |
| Entering shows | Exhibitors | "How to enter a show online", "How to enter multiple dogs" |
| Secretary setup | Secretaries | "How to create a show", "How to add a judge" |
| Show day | All | "How to check in", "How to handle a scratch" |
| Payments | Exhibitors, treasurers | "Why does it say Pending?", "When will the club get paid?" |
| Results | Exhibitors | "Where do I see my results?", "What does Q mean?" |
| Account access | All | "I can't sign in", "How to reset my password" |
| Troubleshooting | All | "Entry not showing after payment", "App says Offline" |

---

## Files

| File | Audience | Status | Aliases (searchable phrases) |
|---|---|---|---|
| [article-template.md](article-template.md) | — | `drafted` | — |

Articles are created here as `how-to-enter-a-show.md`, `payment-under-review.md`, etc. Every article uses the template and includes `aliases` frontmatter.

---

## Article Priority Rules

Write in this order:
1. **High-volume first** — questions that every first-time user hits (sign in, enter a show, find results)
2. **Show-day stress second** — questions that create the most panic when unanswered (entry missing, payment confusion, scratch/move-up)
3. **Sales/onboarding third** — questions from clubs evaluating the platform

---

## Article Naming Convention

`<verb>-<object>.md` where verb and object are the user's words, not feature names.

Good: `enter-a-show.md`, `reset-password.md`, `handle-a-scratch.md`
Avoid: `registration-wizard.md`, `EntryManagementPage.md`, `checkout-success.md`

---

## Staleness Detection

Each article carries `route` frontmatter listing the `pageDirectory.ts` paths it depends on. When those routes change labels or behavior, the article may be stale. A PR touching a route should also check whether any KB article's `route` field references it.
