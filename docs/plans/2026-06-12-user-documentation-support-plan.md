# User Documentation and Support Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reviewed, code-grounded plan for a customer self-service support library: user guide, slide decks, knowledge base, blog/how-to posts, reusable support answers, and other reference material that lets a one-person support operation answer questions quickly.

**Architecture:** Treat the app itself as the primary source of truth, then verify it against role intent, launch-readiness goals, seeded walkthroughs, and real browser captures. Build one canonical source layer, then repurpose it into customer-facing artifacts: short KB answers, printable quickstarts, support macros, slide decks, blog posts, and launch/training packets. The first pass produces documentation architecture, source maps, content models, and acceptance criteria only; final assets wait until the underlying workflows stop moving. Support-operations docs (intake, macros, triage, investigation cookbook) are the exception — they depend on the support workflow, not UI stability, and ship first.

**Tech Stack:** Markdown plans and guides, route/code inventory anchored on the test-enforced `pageDirectory.ts`, Playwright or Codex Browser screenshots for verification, optional future PowerPoint/PDF/video/blog assets generated from reviewed guide outlines.

---

## Guiding Principles

- Documentation follows the fall 2026 launch-readiness goal: secretary/show-day reliability comes first.
- The docs must preserve `docs/INTENT.md`: calm, simple, respectful of non-technical dog-sport users.
- The code can reveal available workflows, but browser walkthroughs must confirm what a user actually experiences.
- Link between existing surfaces instead of documenting duplicated workflows as if both are equally canonical.
- Write final user-facing docs late enough that screenshots, labels, routes, and workflows are unlikely to churn.
- Support-operations docs are different: they serve the support operator, not end users, and are needed from the first real user onward. They are not gated on UI stability.
- Every support artifact should reduce repeated questions or make the answer pointable in under one minute.
- Make answers findable by what the user *says*: index KB content by verbatim error strings and the phrases customers actually use, not internal feature names.
- Use one source, many formats: guide section -> KB article -> support macro -> slide/demo/blog snippet.
- Prefer short, searchable, task-specific answers over giant manuals for common questions.
- Never hand-maintain a second copy of data the codebase already enforces. The route inventory lives in `pageDirectory.ts` (test-synced to the route registry); docs reference or generate from it.

## Duplication Question

Does this duplicate an existing page or feature surface? No. This plan creates a documentation strategy only. During implementation, every documented workflow must identify its canonical in-app surface and avoid legitimizing duplicate routes, dialogs, or old flows that should be consolidated. One near-miss was caught in review: the original Task 2 proposed a hand-written route inventory that would have duplicated `apps/myk9show/src/features/admin-help/data/pageDirectory.ts`; the task now layers workflow mapping on top of that file instead.

## File Map

| Action | Path | Purpose |
| --- | --- | --- |
| Create | `docs/user-guides/README.md` | Index of all user-facing guides and their status |
| Create | `docs/user-guides/workflow-source-map.md` | Workflow → canonical route mapping layered on `pageDirectory.ts` |
| Create | `docs/user-guides/writing-style.md` | Style, tone, and structure rules for all customer-facing docs |
| Create | `docs/support/README.md` | Support-doc index for internal/admin support |
| Create | `docs/support/intake-template.md` | Universal "what to ask first" checklist + intake macro |
| Create | `docs/support/error-message-inventory.md` | Verbatim user-facing error/toast/status strings mapped to answers |
| Create | `docs/support/question-bank.md` | Common customer questions, answer owner, and target artifact |
| Create | `docs/support/common-issues-outline.md` | Troubleshooting taxonomy by symptom, role, and workflow |
| Create | `docs/support/investigation-cookbook.md` | Per-symptom admin recipes: Supabase queries, Stripe dashboard paths |
| Create | `docs/support/macros.md` | Reusable reply snippets for email, chat, and phone follow-up |
| Create | `docs/support/show-day-triage-outline.md` | Outline for the live show-day support runbook |
| Create later | `docs/support/common-issues.md` | Final troubleshooting doc grown from the outline |
| Create later | `docs/support/show-day-triage.md` | Final support runbook for live show-day issues |
| Create | `docs/knowledge-base/README.md` | Customer-facing KB index and article status |
| Create | `docs/knowledge-base/article-template.md` | Standard article structure with search-alias frontmatter |
| Create later | `docs/knowledge-base/articles/*.md` | Future customer-facing help articles |
| Create later | `docs/user-guides/secretary-guide.md` | Secretary setup, entry management, show-day, and closeout guide |
| Create later | `docs/user-guides/exhibitor-guide.md` | Exhibitor account, dog, entry, check-in, payment, and results guide |
| Create later | `docs/user-guides/judge-steward-quickstart.md` | Ringside quickstart for judges and gate stewards |
| Create later | `docs/user-guides/club-admin-guide.md` | Club setup, show access, payments, and operational responsibilities |
| Create | `docs/training/README.md` | Training material index and asset checklist |
| Create | `docs/training/myk9show-overview-deck-outline.md` | Slide-deck outline before creating PowerPoint |
| Create | `docs/training/role-based-deck-outlines.md` | Secretary, exhibitor, club, judge/steward deck outlines |
| Create | `docs/training/screenshot-shot-list.md` | Required screenshots/video captures by workflow |
| Create | `docs/blog/README.md` | Customer education/blog content calendar and article status |
| Create | `docs/blog/post-template.md` | Standard structure for educational posts |
| Create | `docs/user-guides/documentation-qa-checklist.md` | Verification checklist for final guides |
| Modify | `OPEN-TODOS.md` | Track when documentation tasks become ready to execute |

## Support Operating Model

This documentation system exists because support will start as a one-person operation. The goal is not just "complete docs"; it is fast answer reuse.

Every repeated customer question should end in one of these outcomes:

| Question type | Best artifact | Example |
| --- | --- | --- |
| "How do I do this?" | KB article or user-guide section | "How do I enter a dog in a show?" |
| "What does this mean?" | Short KB explainer | "What does Under review by Stripe mean?" |
| "I got an error saying…" | Error-inventory entry → KB article or macro | "It says Payment could not be processed" |
| "I am stuck right now" | Support macro + troubleshooting article | "My payment went through but my entry is missing" |
| "Can you train our club?" | Slide deck + printable quickstart | "Secretary show-day overview" |
| "Why should we use this?" | Blog post or overview deck | "How myK9Show helps trial secretaries on show day" |
| "What changed?" | Blog/changelog-style post | "What exhibitors need to know before entering online" |

Support material should be written so Richard can say: "Here is the exact page for that," instead of rewriting the answer each time. Two lookup paths must work: by task ("check in a dog") and by symptom ("entry not showing" or a quoted error string).

## QA-Draft Mode: Documentation as a Testing Instrument

Drafting docs during development is deliberate, not premature. Writing a task-based guide is the cheapest UX audit available: to write "Step 3: Click **Approve Entries**," you must walk the real flow, and friction becomes visible in the prose itself. The rules that keep this from backfiring:

- **Draft now, publish later.** The Phase 0 readiness gate governs *publication* (screenshots, `verified`, customer-facing status), not *writing*. Any guide may be drafted at any time as a QA instrument.
- **Drafts are disposable.** Early drafts carry `status: qa-draft`. When drafting reveals friction, the **app** changes and the draft is cheerfully thrown away or rewritten. Never let an existing draft create pressure to keep the UI matching the doc — the arrow points from app to doc, always.
- **Friction findings go to the backlog, not the doc.** While drafting, every one of these is a product finding, not something to write around:
  - A step that is hard to write ("click the three-dot menu, then Manage, then scroll to…") — UI friction.
  - Step-count bloat or a "note that…" warning — measurable UX debt.
  - "You can also do this from…" — a duplicated surface to consolidate (this phase's core goal).
  - A button label that can't be used in a sentence without explanation — a naming bug.
  - A predicted question with no good answer — a missing error/empty state.
- **File findings immediately** to `OPEN-TODOS.md` (or the relevant sprint/debt doc) with the guide section that surfaced them, so the draft-walk produces a concrete punch list each time.

## Canonical Source Inventory

Before writing any guide, inventory these sources and mark which one is canonical when surfaces overlap:

- `apps/myk9show/src/features/admin-help/data/pageDirectory.ts` — **canonical route inventory.** Hand-authored directory of every user-facing page (title, description, roles, classification, status, links) and test-enforced to stay in sync with the route registry via `pageDirectory.test.ts`. Docs reference or generate from it; never fork it into markdown.
- `docs/INTENT.md`
- `docs/goals/fall-2026-launch-readiness.md`
- `docs/goals/fall-2026-launch-readiness-scorecard.md`
- `docs/journeys/secretary.md`
- `docs/journeys/exhibitor.md`
- `docs/roles/secretary.md`
- `docs/roles/exhibitor.md`
- `docs/roles/judge.md`
- `docs/roles/steward.md`
- `docs/roles/club-admin.md`
- `docs/testing/secretary-golden-path-checklist.md`
- `docs/testing/exhibitor-golden-path-checklist.md`
- `docs/operations/stripe-platform-setup.md`
- Future `docs/guides/club-payment-setup-guide.md`
- Future `docs/knowledge-base/`
- Future `docs/support/`
- Future `docs/blog/`
- `apps/myk9show/src/routes/`
- `apps/myk9show/src/components/layout/sidebar/`
- `apps/myk9show/src/features/admin-help/`
- `apps/myk9show/src/pages/`
- `apps/myk9show/src/features/at-show/`
- `apps/myk9show/src/features/payments/`

## Phase 0: Readiness Gate

This gate applies to **final customer-facing documentation** (guides, KB articles with screenshots, decks). It does NOT block Phase 2 support-operations docs, which serve the support operator and degrade gracefully when the UI churns. It also does not block `qa-draft` writing — drafting during development is encouraged as a testing instrument (see QA-Draft Mode); the gate governs publication, not writing.

Do not publish final customer-facing documentation until the relevant workflow meets these criteria:

- [ ] The workflow has a canonical route or page (per `pageDirectory.ts`).
- [ ] Duplicate routes or overlapping surfaces have been consolidated or explicitly marked as temporary.
- [ ] Labels, buttons, and navigation names are stable enough for screenshots.
- [ ] The workflow is covered by a current golden-path checklist or browser walkthrough.
- [ ] Known launch blockers for that workflow are resolved or clearly called out as "not ready to document."
- [ ] Offline/show-day behavior is verified for secretary, judge, and steward flows where applicable.
- [ ] The likely customer questions for that workflow are known well enough to write concise answers.
- [ ] Support impact is clear: high-volume, high-stress, launch-critical, or sales/training value.

## Phase 1: Documentation Architecture

### Task 1: Create the Documentation Source Map

**Files:**
- Create: `docs/user-guides/README.md`
- Create: `docs/support/README.md`
- Create: `docs/knowledge-base/README.md`
- Create: `docs/blog/README.md`
- Create: `docs/training/README.md`

- [ ] List each planned document, audience, owner, status, and readiness gate.
- [ ] Add status values: `planned`, `source-mapped`, `qa-draft`, `walkthrough-needed`, `draft-ready`, `drafted`, `verified`, `published`. `qa-draft` marks a disposable draft written during development as a testing instrument (see QA-Draft Mode); it never ships to customers.
- [ ] Link every planned guide to the canonical app surfaces it depends on.
- [ ] Add a "do not document yet" section for unstable workflows.
- [ ] Add support-deflection priority: `high`, `medium`, `low`.
- [ ] Add artifact type: `guide`, `kb`, `macro`, `deck`, `blog`, `quickstart`, `runbook`.

### Task 2: Map Workflows onto the Canonical Page Directory

**Files:**
- Create: `docs/user-guides/workflow-source-map.md`

The route inventory already exists: `pageDirectory.ts` lists every user-facing page with roles, classification, status, and link graph, and a test keeps it in sync with the route registry. This task adds only the layer that file does not have — the mapping from *user workflows* to routes. Do not restate per-route data that `pageDirectory.ts` already holds.

- [ ] Read `pageDirectory.ts` and confirm its coverage matches the current sidebar navigation in `apps/myk9show/src/components/layout/sidebar/`; fix the directory (not the doc) if they disagree.
- [ ] Define the user workflows per role (secretary, exhibitor, club admin, judge, steward, site admin, public/guest) and map each workflow to its route(s) by path reference.
- [ ] Flag duplicated workflows where the same user outcome appears in more than one route, and identify the canonical route to document.
- [ ] Mark routes that are internal/legacy/admin-only and excluded from customer docs.
- [ ] Evaluate generating the markdown table from `pageDirectory.ts` with a small script instead of hand-maintaining it; if hand-maintained, reference routes by path only so staleness is greppable.

### Task 3: Define Documentation Style Rules

**Files:**
- Create: `docs/user-guides/writing-style.md`

- [ ] Write for non-technical volunteers and exhibitors.
- [ ] Prefer task language: "Approve an entry" instead of implementation language.
- [ ] Avoid software jargon, schema names, internal route names, and feature-flag names.
- [ ] Use numbered steps for actions, short troubleshooting blocks for errors, and plain-English terms from dog shows.
- [ ] Add role tone notes from `docs/INTENT.md`: secretary "That was easy", exhibitor "This respects my time", judge "Invisible technology", steward "I've got this under control".
- [ ] Define KB article length targets: answer first, then steps, then "still stuck?" escalation.
- [ ] Define blog-post tone: educational, reassuring, practical, never salesy or overpromising.
- [ ] Define support macro tone: short, warm, specific, and link-forward.

### Task 4: Build the Support Question Bank

**Files:**
- Create: `docs/support/question-bank.md`

- [ ] Seed the question bank from known workflows, golden-path audits, payment walkthroughs, and likely first-club questions.
- [ ] Group questions by role: secretary, exhibitor, club/treasurer, judge, steward, site admin.
- [ ] Add columns: question, likely trigger, answer artifact, support priority, workflow readiness, source file/route.
- [ ] Record each question in the customer's words, including the error text they would quote.
- [ ] Mark questions that need product fixes instead of documentation.
- [ ] Identify the first 25 questions Richard is most likely to receive during early launch.

## Phase 2: Support Operations Documentation

These artifacts are what a one-person support team needs from the first real user onward. They are deliberately scheduled **before** the role-guide outlines: macros, intake, and triage depend on the support workflow, not on stable screenshots, and a macro can say "we're looking into it — here's what to check" without any UI capture.

### Task 5: Support Intake Template

**Files:**
- Create: `docs/support/intake-template.md`

- [ ] Define the universal intake checklist: name/email, role, club/show, the page they were on, what they were trying to do, exact error text or screenshot, device and browser, and whether they were online or offline at the time.
- [ ] Add offline-first specifics: how to ask a non-technical user about connectivity and sync state without jargon, and which symptoms suggest a sync issue versus a data issue.
- [ ] Write the intake request as a ready-to-send macro (email and text-message variants).
- [ ] Define which intake fields map to which investigation starting points (links into the investigation cookbook, Task 8).

### Task 6: Error Message Inventory

**Files:**
- Create: `docs/support/error-message-inventory.md`

The most common support report quotes an error verbatim. This inventory makes the support library searchable by exactly what the user says.

- [ ] Grep the codebase for user-facing strings: toast calls, error states, empty states, form validation messages, and payment/Stripe status labels.
- [ ] List each verbatim string with: where it appears (route/component), what triggers it, what the user should do, and what support should check.
- [ ] Map each string to its target artifact: KB article, macro, or "needs product fix" (confusing message → backlog item, not documentation).
- [ ] Include third-party strings users will quote: Stripe statuses ("Under review"), browser/PWA messages, and email-delivery failures.
- [ ] Note which strings are likely to churn and re-check them during Phase 6 verification.

### Task 7: Knowledge Base Article System

**Files:**
- Create: `docs/knowledge-base/README.md`
- Create: `docs/knowledge-base/article-template.md`

- [ ] Define article categories: getting started, entering shows, secretary setup, show day, payments, results, account access, troubleshooting.
- [ ] Create article template sections: answer, who this is for, steps, screenshots needed, related articles, when to contact support.
- [ ] Add structured frontmatter to the template — `title`, `audience`, `route`, `aliases`, `last-verified` — where `aliases` lists the verbatim phrases and error strings users are likely to say or search. Aliases make articles greppable today and portable to any future help-center platform or in-app rendering without rewriting.
- [ ] Define article naming convention: `how-to-enter-a-show.md`, `payment-under-review.md`, `secretary-closeout-checklist.md`.
- [ ] Add article priority rules: high-volume first, show-day stress second, sales/onboarding third.
- [ ] Link every KB article back to a user-guide source section.

### Task 8: Admin Investigation Cookbook

**Files:**
- Create: `docs/support/investigation-cookbook.md`

Internal-only. For each symptom support cannot resolve from docs alone, the exact recipe to investigate it — written for future-Richard at 7am on a show day.

- [ ] For each high-priority symptom from the question bank, write the concrete investigation steps: which Supabase table/query to check (e.g., entry missing after payment → `entries.confirmation_email_status`, then Stripe dashboard → Payments → search by email), which dashboard path, which log.
- [ ] Cover the known investigation surfaces: Supabase tables and RLS-visible state, Stripe Connect dashboard (payments, payouts, account review status), Resend email delivery, and replication/sync state for offline reports.
- [ ] Mark which recipes are read-only versus which involve mutating data, and require an explicit confirmation step before any mutation.
- [ ] Note per recipe what to tell the customer while investigating (link to the matching macro).
- [ ] Flag recurring investigation patterns that justify an admin UI affordance later — file those to the product backlog rather than expanding the cookbook forever.

### Task 9: Common Issues Taxonomy

**Files:**
- Create: `docs/support/common-issues-outline.md`

- [ ] Group issues by user symptom: cannot sign in, cannot find show, entry not visible, payment trouble, check-in problem, scoring issue, results missing, sync/offline concern.
- [ ] For each issue, define what support should ask first (reference the intake template rather than restating it).
- [ ] Link support answers to user-guide sections instead of duplicating full instructions.
- [ ] Link issues requiring admin-only database or Stripe investigation to their investigation-cookbook recipe.
- [ ] Identify which issues should become support macros.

### Task 10: Support Macro Library

**Files:**
- Create: `docs/support/macros.md`

- [ ] Define reusable answer snippets for email, chat, and phone follow-up.
- [ ] Include macros for account access, entry status, payment status, club onboarding, show-day sync, results timing, and "we are checking this now."
- [ ] Include the intake-request macro (from Task 5) and a "send me the exact error text" macro.
- [ ] Each macro must include a customer-facing link target or a placeholder for the future KB link.
- [ ] Keep macros warm, brief, and specific enough to send with minimal editing.

### Task 11: Show-Day Triage Runbook Outline

**Files:**
- Create: `docs/support/show-day-triage-outline.md`

- [ ] Define support severity levels for live shows.
- [ ] Create a first-five-minutes checklist for secretary/show-day incidents.
- [ ] Include offline/sync checks, entry visibility checks, scoring checks, and communication fallback steps.
- [ ] Identify escalation paths that need engineering, Stripe, Supabase, or manual club action — each linked to its investigation-cookbook recipe.
- [ ] Identify which triage steps should become "during a live show" customer-facing KB articles.

## Phase 3: Role Guide Outlines

Outlines may begin immediately and should include rough numbered-step drafts (`qa-draft`) walked against the live app in a browser. The walk itself is the point: every friction finding (hard-to-write step, duplicated surface, confusing label, missing error state) is filed to the product backlog per QA-Draft Mode. Screenshots and publication still wait for the Phase 0 gate.

### Task 12: Secretary Guide Outline

**Files:**
- Create: `docs/user-guides/secretary-guide-outline.md`

- [ ] Outline show setup, entry management, communications, show-day operations, scoring oversight, closeout, reports, payments, and support escalation.
- [ ] Prioritize show-day reliability and secretary next-action guidance.
- [ ] Identify which sections require screenshots.
- [ ] Mark unstable sections that should wait until post-consolidation.
- [ ] Cross-check against `docs/journeys/secretary.md` and the secretary golden-path checklist.
- [ ] For each section, list the KB articles and support macros it should generate.

### Task 13: Exhibitor Guide Outline

**Files:**
- Create: `docs/user-guides/exhibitor-guide-outline.md`

- [ ] Outline account setup, dogs, browsing shows, entering a show, payment, check-in, messages, results, and profile/history.
- [ ] Keep the entry/payment flow as a readiness gate until the registration wizard and Stripe handoff are stable.
- [ ] Identify what should be written for guests versus signed-in exhibitors.
- [ ] Cross-check against `docs/journeys/exhibitor.md` and the exhibitor golden-path checklist.
- [ ] For each section, list the KB articles and support macros it should generate.

### Task 14: Ringside Quickstart Outline

**Files:**
- Create: `docs/user-guides/judge-steward-quickstart-outline.md`

- [ ] Outline judge scoring, steward check-in/run order, offline expectations, sync status, and what to do if the tablet loses connectivity.
- [ ] Keep this short enough to print or hand to ringside volunteers.
- [ ] Verify whether the canonical surface is myK9Show `/at-show`, not the deleted monorepo `apps/myk9q` app.
- [ ] Document only workflows that have current offline-first verification.
- [ ] Identify the shortest printable quickstart that can sit beside a ringside tablet.

### Task 15: Club Admin and Treasurer Outline

**Files:**
- Create: `docs/user-guides/club-admin-guide-outline.md`

- [ ] Outline club access, show responsibilities, payment setup, payout expectations, and support escalation.
- [ ] Link to the future treasurer payment setup guide instead of duplicating it.
- [ ] Include a clear "what myK9Show does / what Stripe does" boundary.
- [ ] Gate payment screenshots until a fresh sandbox onboarding walkthrough is captured.
- [ ] List treasurer-specific KB answers for SSN, bank account changes, review status, payouts, refunds, and statement descriptors.

## Phase 4: Training and Presentation Materials Plan

### Task 16: Overview Deck Outline

**Files:**
- Create: `docs/training/myk9show-overview-deck-outline.md`

- [ ] Create a slide outline only, not the PowerPoint file.
- [ ] Audience: club decision-makers, secretaries, and early support users.
- [ ] Sections: what myK9Show is, role workflows, show-day reliability, payments, support model, launch-readiness roadmap.
- [ ] Mark every slide that needs a screenshot or short browser capture.
- [ ] Keep the deck grounded in real workflows, not marketing claims.
- [ ] Add a "what to send after the demo" section linking to guides and KB articles.

### Task 17: Role-Based Slide Deck Outlines

**Files:**
- Create: `docs/training/role-based-deck-outlines.md`

- [ ] Create short deck outlines for secretary onboarding, exhibitor onboarding, club/treasurer setup, and judge/steward show-day use.
- [ ] Keep each deck small enough for a 10-15 minute walkthrough.
- [ ] For each deck, define the leave-behind link list: guide, KB articles, quickstart, and support contact path.
- [ ] Mark which decks can share slides with the overview deck.

### Task 18: Screenshot and Demo Asset Shot List

**Files:**
- Create: `docs/training/screenshot-shot-list.md`

- [ ] List required screenshots by workflow and role.
- [ ] Record the route, seeded account, seed show, viewport size, and expected state for each shot.
- [ ] Separate screenshots for user guides, support runbooks, and deck/training material.
- [ ] Mark screenshots as blocked when the UI is not stable.
- [ ] Add browser-capture needs for short training clips or animated deck walkthroughs.

## Phase 5: Blog and Customer Education Plan

### Task 19: Blog Content System

**Files:**
- Create: `docs/blog/README.md`
- Create: `docs/blog/post-template.md`

- [ ] Define the purpose of blog posts: customer education, launch readiness, trust-building, and reducing repeated explanation.
- [ ] Define post categories: secretary tips, exhibitor tips, club operations, payments explained, show-day reliability, release notes.
- [ ] Create a post template: audience, customer question answered, main takeaway, steps or story, related guide/KB links.
- [ ] Add rules for when a KB article should become a blog post: broader context, launch announcement, workflow explanation, or trust-building.

### Task 20: First 12 Blog/Post Ideas

**Files:**
- Create: `docs/blog/content-calendar-outline.md`

- [ ] Draft the first 12 article ideas by title and audience.
- [ ] Include at least four secretary/show-day posts.
- [ ] Include at least three exhibitor self-service posts.
- [ ] Include at least two club/payment/treasurer posts.
- [ ] Link each idea to the user-guide or KB section it should reference.

## Phase 6: Drafting and Verification

### Task 21: Draft Only Stable Sections

**Files:**
- Create later: final files listed in the File Map

- [ ] Draft a section only when its readiness gate passes.
- [ ] Use browser screenshots from the shot list, not stale screenshots from old branches.
- [ ] Add "Last verified" date and verified route/account to each final guide.
- [ ] Keep each guide task-based and printable where practical.
- [ ] For each guide section, generate the matching KB article, macro, and deck/blog link candidates.

### Task 22: Documentation Accuracy Testing

**Files:**
- Create: `docs/user-guides/documentation-qa-checklist.md`

- [ ] Recruit the non-author reviewer early (a friendly secretary or club contact) — this is the one task in this plan a one-person team cannot do alone; name the person before drafting begins.
- [ ] For each final guide, perform a real browser walkthrough following only the written steps.
- [ ] Verify button labels, page names, route behavior, screenshots, and error states.
- [ ] Re-verify the error-message inventory: confirm each documented string still matches the live app verbatim.
- [ ] Have the non-author reviewer perform at least the secretary and exhibitor guides.
- [ ] Update any failing guide step before marking the guide `verified`.
- [ ] For support runbooks, test at least one simulated issue per severity level.
- [ ] For KB articles and macros, verify that a customer can reach the right answer in one or two links.

### Task 23: Tracking and Maintenance

**Files:**
- Modify: `OPEN-TODOS.md`
- Modify later: relevant guide indexes

- [ ] Add a single pre-launch documentation parent item.
- [ ] Track child items by role guide and support area.
- [ ] Make staleness detection mechanical, not honor-system: each guide's source map lists the routes it depends on by path; because `pageDirectory.ts` is already test-synced to the route registry, a small script (or at minimum a PR-template checkbox) can compare changed routes against guide source maps and flag "this doc may be stale."
- [ ] Review docs after each workflow consolidation PR that changes routes, labels, or screenshots.
- [ ] Do not publish docs that point users to deprecated or duplicate surfaces.
- [ ] Keep a "questions we keep getting" loop: every repeated support question updates the question bank, KB, macro library, error inventory, or product backlog.

## Acceptance Criteria

- [ ] The plan publishes no final customer-facing documentation until workflows are stable; support-operations docs (intake, error inventory, cookbook, macros, triage) ship first and are not gated on UI stability.
- [ ] QA-drafts are written during development and each draft-walk produces filed backlog findings (UX friction, duplicated surfaces, naming, missing states) — docs change the app, never the reverse.
- [ ] Every future document has an audience, purpose, source map, and readiness gate.
- [ ] Secretary/show-day documentation is prioritized first among customer-facing guides.
- [ ] The route inventory is anchored on `pageDirectory.ts`; no hand-maintained duplicate route list exists in docs.
- [ ] A customer-quoted error string can be looked up verbatim and resolves to an answer or macro in under a minute.
- [ ] Every support symptom that needs admin investigation has a concrete cookbook recipe (query/dashboard path), not just a "check the database" note.
- [ ] Support docs, KB articles, and macros link to user guides instead of duplicating large sections.
- [ ] KB articles carry alias frontmatter so they are greppable now and portable to a future help center or in-app rendering without rewriting.
- [ ] Training/deck work starts as outlines and screenshot lists, not premature PowerPoint files.
- [ ] Blog/customer education topics are mapped to real support needs and guide sections.
- [ ] Richard can answer common launch questions by sending a link or macro rather than rewriting the answer.
- [ ] Final guides require real browser verification before publication.

## Out of Scope for This Plan

- Writing the final user guides now.
- Creating a PowerPoint, PDF, or video asset now.
- Building an in-app help center (KB frontmatter is structured so articles could render in-app later without rewriting, but no app routes or UI are added by this plan).
- Choosing a public knowledge-base/blog platform.
- Adding new app routes, dialogs, tours, or onboarding UI.
- Rebuilding any deleted `apps/myk9q` documentation.

## Review Questions Before Implementation

- Which role guide should be drafted first after secretary/show-day workflows stabilize?
- Should support docs live only in the repo, or should they also be prepared for an external help center later?
- Where should customer-facing KB and blog content ultimately live: repo-rendered docs, website, app help center, or a support tool?
- Do we want a printed quickstart packet for show-day volunteers separate from the full user guide?
- What seeded shows/accounts should become the canonical screenshot fixtures?
- Who is the non-author reviewer for the first secretary guide walkthrough (recruit before drafting begins)?
- What are the first 25 questions Richard expects from secretaries, exhibitors, clubs, and treasurers?
- Should the workflow-source-map markdown be generated from `pageDirectory.ts` by a script, or hand-maintained with path-only references?
