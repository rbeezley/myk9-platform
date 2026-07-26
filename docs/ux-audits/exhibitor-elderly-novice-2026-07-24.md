# Exhibitor Role Journey UX Audit — Elderly Novice

- **Date:** 2026-07-24
- **Auditor:** Claude (`role-journey-ux-audit`)
- **Persona:** Retired, no computer or smartphone skills. Reads labels literally, does not
  discover hover/scroll affordances, and treats any number on screen as a promise.
- **Account:** `e2e-exhibitor@test.myk9.com` (canonical seeded exhibitor, Free tier, dark mode)
- **Viewports:** mobile 390×844 (full walk), desktop 1280×800 (full pass),
  tablet 834×1112 portrait + 1112×834 landscape (diff pass)
- **Baseline:** [`exhibitor-elderly-novice-2026-07-23.md`](exhibitor-elderly-novice-2026-07-23.md)
- **Scope note:** Free tier only. Premium record-editing surfaces (Health/Training/Pedigree
  create + edit) are read-only on this account, so most of the baseline's Premium findings
  could not be re-tested this run. No Stripe checkout was completed.

## Overall experience

The **core Free lifecycle is in good shape and, in places, genuinely excellent.** Sign-in is a
calm two-step flow with an Edit affordance and a show-password toggle. Navigation is five
plain-language items — the right answer for this persona. Adding a dog validates properly,
echoes the dog's age back, states plainly that "This dog will be registered to your account,"
and finishes with a toast that both names the result ("Biscuit added") and offers the next step
("Enter a show"). The four-step entry wizard has a visible stepper, per-class pricing, running
cart totals, and a correctly-gated agreement checkbox that explains why it is blocking.

Two things spoil it. First, **a lingering success toast renders on top of sticky footer action
bars and silently steals the tap intended for Save.** Walking as the persona, this destroyed a
dog edit with no warning and no error — the app reported nothing and navigated away. Second,
**the app cannot agree with itself about money or counts.** My Shows says `$300 fees / $150 due`
while My Payments, one click away, says `$0.00 — Current entries are paid up`. "My entries" is
simultaneously 5, 7, 15, and 10 on three surfaces.

For an elderly novice, these are not polish issues — they are the two things that make a person
stop trusting software: _it lost my work_, and _it is lying to me about what I owe_.

Across viewports the pattern is consistent: **desktop is the designed target, mobile is where it
breaks.** Several screens carry disambiguating text on desktop that is simply dropped on mobile
(the "Upcoming + in review" caption under the ambiguous `5`), and the mobile sticky footers
overflow the viewport, clipping the primary button.

**Overall UX health: Needs work.** The Free journey is completable, but not safely — a user can
lose an edit without knowing, and cannot reconcile what they owe.

## Regression line

Against the 2026-07-23 baseline (18 findings):

- **NEW:** 18 findings — dominated by the toast/footer collision, form-footer overflow at mobile,
  and data-consistency defects in the dog record.
- **STILL OPEN:** 4 — money contradiction (#10), "Add or Change Entries" false promise (#11),
  count reconciliation (#12), payments-table overflow (#16, now confirmed **worse** than reported:
  it clips at desktop width too, not just mobile).
- **RESOLVED:** 2 verified by direct re-walk — the seven-tab dog overflow (#5) is now three tabs
  (Overview / Career / Records) that fit at every tested width, and Health Timeline search (#4)
  now retains typed input.
- **NOT RE-TESTED:** 12 — all remaining Premium findings (#1, #2, #3, #6, #7, #8, #9, #13, #14,
  #17), plus dog-list scroll restoration (#15) and the repo docs contradiction (#18). The account
  is Free, so Premium create/edit controls are gated behind a read-only banner.

Baseline #6 (Pedigree tree clipping) showed a **partial improvement**: at tablet portrait the tree
now stacks into 2×2 rows with no clipping. This is not scored RESOLVED because the walked dog had
an empty pedigree, so populated grandparent cards were never rendered.

## Top 5 to fix first

1. **Stop toasts from covering sticky action bars.** A tap on "Save Changes" hit the toast's
   "Enter a show" button, navigated away, and discarded the edit silently. The dialog was
   tracking "Unsaved changes" at that exact moment and still did not warn.
2. **Make money one number.** `$300 fees / $150 due / $0.00 paid up / $96.30 gross paid` are four
   answers to "what do I owe?" on two adjacent pages.
3. **Fix the mobile sticky footer overflow.** On the Add/Edit Dog form at 390px, the primary
   button ("Create Dog" / "Save Changes") runs off the right edge of the screen once the
   "Unsaved changes" indicator appears.
4. **Give exhibitors a real entry-management path, or stop promising one.** "Add or Change
   Entries" cannot change anything — every existing class is `disabled`, and no Edit, Withdraw,
   or Cancel control exists on any entry card.
5. **Rename "Not accepted."** To a retiree this reads as _rejected_. It appears on entries whose
   sibling rows say "Pending Review — the show secretary is reviewing this entry."

## Findings

Severity per `UX-Audit`: **Critical** = cannot complete core task / data loss ·
**High** = struggles significantly · **Medium** = friction · **Low** = polish.

| #   | Severity | Reg        | Tag       | Viewport(s)    | Path & screen                       | What confused the persona                                                                                                                                                                                                                                                                                | Why it's a problem                                                                                                                                                                                                                                                                    | Concrete fix                                                                                                                                                                                                                                                                               |
| --- | -------- | ---------- | --------- | -------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Critical | NEW        | buildable | all (mobile ×) | `/dogs/:id` Edit Dog dialog         | A "Biscuit added" toast persisted across three navigations and sat on top of the dialog footer. Tapping **Save Changes** activated the toast's **Enter a show** button instead, navigating to `/shows`.                                                                                                  | The registered-name edit was **silently lost**. No error, no confirm, no unsaved-changes prompt — despite the footer showing "Unsaved changes". Verified by reopening: value was still `Biscuit`.                                                                                     | Render toasts in a layer **below** sticky action bars, or offset the bar by the toast height. Auto-dismiss toasts on route change. Add a route-leave guard when the form is dirty.                                                                                                         |
| 2   | High     | NEW        | buildable | mobile         | Add Dog / Edit Dog sticky footer    | With "Unsaved changes" present, the footer's primary button is pushed past the right edge — "Create Dog" rendered as "Crea…", "Save Changes" partially offscreen.                                                                                                                                        | The single most important control on the screen is clipped. The persona cannot tell whether the button is broken or the screen is.                                                                                                                                                    | Make the footer wrap or stack at narrow widths; drop the "Unsaved changes" text to an icon/dot below `sm`. Give the primary button `flex-shrink-0`.                                                                                                                                        |
| 3   | High     | NEW        | buildable | mobile         | Add Dog — empty submit              | Submitting empty correctly blocks, but the footer error summary is crushed into a ~100px column wrapping one word per line ("Please / enter a / call / name"), and hides the third error behind **"(+1 more)"**.                                                                                         | The user is told they made three mistakes but can only see two, and the text is nearly unreadable. Inline field errors are fine; the summary is the problem.                                                                                                                          | Move the summary above the footer, full width. List every error or make "+1 more" scroll to it. Never truncate an error count the user must act on.                                                                                                                                        |
| 4   | High     | NEW        | buildable | all            | Dog breed across surfaces           | A dog created without a registration is recorded as **"Mixed Breed"**. It then rendered as "Mixed Breed" (mobile list), **"Unknown"** (desktop list), and **"Breed not set"** (entry wizard) after an unrelated edit was saved.                                                                          | The app asserts a breed the owner never entered. Telling an exhibitor their purebred is recorded as Mixed Breed is offensive, and disclosure does not fix it — the value is **stored**, so it can reach entry blanks and organization submissions. One value also renders three ways. | The dog record carries **no breed**; breed exists only on a registration. An unregistered dog displays no breed rather than a guess. Requires the data-model change (design § Follow-ups) — `dogs.breed` is `NOT NULL`. Separately isolate whether Edit Dog rewrites breed when untouched. |
| 5   | High     | NEW        | buildable | all            | Add Dog vs Edit Dog                 | **Registered Name** is required (`*`) on Edit but is never requested on Add — it was auto-filled with the call name, so the audited dog's registered name became "Biscuit".                                                                                                                              | A registered name belongs to a **registration with an organization** (e.g. call name "Tera" / AKC registered name "Maia TeraByte Van Neerland"), not to the dog record. `dogs.name` is `NOT NULL` and the app writes the call name into it purely to satisfy that constraint.         | **Remove** the Registered Name field from the base dog record; capture it inside each registration, where `dog_registrations.registered_name` already exists. This deletes a required field rather than adding one. Column normalization is a separate, migration-bearing change.          |
| 6   | High     | STILL OPEN | buildable | all            | My Shows ↔ My Payments              | My Shows: **CURRENT FEES $300 · Amount due $150** with two _Finish Payment_ buttons. My Payments: **Amount due $0.00 — "Current entries are paid up."** in a green, reassuring card.                                                                                                                     | The persona either believes they owe $150 and cannot find where to pay it, or believes they are paid up and misses the entry deadline. Baseline #10 unchanged.                                                                                                                        | Derive amount-due from one server-backed selector shared by both pages. Add a cross-page contract test for this account.                                                                                                                                                                   |
| 7   | High     | STILL OPEN | buildable | all            | Show detail → Add or Change Entries | The CTA promises change. For Willow, all five classes render checked with **"Already entered"** and every checkbox is `disabled: true` — nothing can be added, changed, or withdrawn.                                                                                                                    | A dead end reached by following the app's own instruction. Disabled checkboxes are styled in the same orange as active ones, so they look tickable.                                                                                                                                   | Rename to **Add Classes**. State plainly that changes/withdrawals go through the show secretary, with contact info. Style disabled controls as visibly inert. Baseline #11.                                                                                                                |
| 8   | High     | NEW        | buildable | all            | Entry cards / entry lifecycle       | No entry can be edited or withdrawn anywhere. Card actions are only _View Show_, _Check In_, _Finish Payment_, _Show details_.                                                                                                                                                                           | "I entered the wrong class" and "my dog is injured" have no self-service answer. This is the broader form of #7.                                                                                                                                                                      | Decide the scope deliberately. If withdrawal is secretary-mediated pre-launch, say so on the entry card and link to the secretary — do not leave the user hunting.                                                                                                                         |
| 9   | High     | NEW        | buildable | all            | Show detail → run schedule          | Statuses read **"Not accepted"** on classes whose sibling rows say "Pending Review — the show secretary is reviewing this entry."                                                                                                                                                                        | "Not accepted" reads as _rejected_. The persona concludes their dog was turned away and may re-enter or call the club.                                                                                                                                                                | Use the same vocabulary as the entry cards: **Awaiting review**. Reserve an explicit _Declined_ only for true rejections, with a reason.                                                                                                                                                   |
| 10  | Medium   | STILL OPEN | buildable | all            | My Shows + show detail              | "My entries" is **5** (summary), **7** (ALL ENTRIES), **15** (show tab badge), and **10** ("10 classes across 5 dogs"). Desktop alone explains the 5 via a caption; mobile drops that caption.                                                                                                           | Each number is individually defensible and none is labelled. The persona cannot tell whether something is missing. Baseline #12.                                                                                                                                                      | Name the counting unit in the label itself ("5 upcoming entries", "15 class entries"). Use shared selectors. Keep the desktop caption at all widths.                                                                                                                                       |
| 11  | Medium   | STILL OPEN | buildable | all            | My Payments table                   | At 390px only **Date** and **Show** are visible; Amount, Status, and Receipt are offscreen with no scroll cue, and all three rows show the same show name — the refund is indistinguishable from payments. **Also clips at 1280px desktop** (Receipt renders "Recei…").                                  | Baseline #16 reported this as mobile-only. It is every viewport. On a page whose entire job is "what did I pay?", the amount is the hidden column.                                                                                                                                    | Card layout below `md` with amount + status + receipt visible. At desktop, let the table fit or make Receipt an icon column. Add a scroll affordance where it must scroll.                                                                                                                 |
| 12  | Medium   | NEW        | buildable | all            | Sidebar / nav drawer                | Every nav subtitle is truncated at every width — "Your entries, dogs,…", "Manage your dogs…", "Find check-in, run…". The full strings exist in the DOM ("Your entries, dogs, and upcoming shows").                                                                                                       | The explanatory text written specifically to orient a novice is the text being cut. Pure CSS clipping, not a content problem.                                                                                                                                                         | Allow two lines (`line-clamp-2`) or widen the rail. This is a small fix with outsized benefit for the target persona.                                                                                                                                                                      |
| 13  | Medium   | NEW        | buildable | mobile         | Entry wizard step 1                 | The dog picker is a **fixed-height 464px inner scroll container** (1368px of content) nested inside the page scroll, on an 844px-tall phone.                                                                                                                                                             | Two competing scrollbars. Content moves unpredictably; the persona cannot reliably reach the Next button or later dogs.                                                                                                                                                               | Let the dog list flow in page scroll at narrow widths. Reserve the inner scroll region for `md` and up.                                                                                                                                                                                    |
| 14  | Medium   | NEW        | buildable | all            | Dog detail → Overview               | Overview opens on _registrations_, not the dog. It shows **three** "Add Registration" buttons on one screen with three capitalizations ("Add New Registration", "Add Registration", "Add registration"), and no breed/age/sex until the About panel — which on mobile sits below the entire tab content. | After saving an edit, the user lands on a page that shows none of what they just changed, and is asked the same question three times.                                                                                                                                                 | Lead Overview with the dog's identity. Keep one Add Registration CTA. Hoist About above the tabs on mobile. Standardise sentence case.                                                                                                                                                     |
| 15  | Medium   | NEW        | buildable | all            | Entry wizard step 2                 | A brand-new dog with no titles is offered **Excellent**, **Advanced**, and **Master** levels with no eligibility guidance, at $30 each.                                                                                                                                                                  | A novice cannot know that Master is not an entry-level class. A wrong pick costs $30 and a wasted trip, and cannot be corrected later (see #8).                                                                                                                                       | Show eligibility hints or mark levels the dog has not qualified for. At minimum add one line: "Not sure which level? Novice classes are the starting point."                                                                                                                               |
| 16  | Medium   | NEW        | buildable | all            | Entry wizard step 1                 | "No registration on file — verify before submitting" is **accurate** (dogs with AKC numbers correctly omit it), but there is no link or instruction for how to add one.                                                                                                                                  | A correct warning the user cannot act on. The persona is told to "verify" with no verb available to them.                                                                                                                                                                             | Link the warning to Add Registration for that dog, inline in the wizard.                                                                                                                                                                                                                   |
| 17  | Medium   | NEW        | buildable | all            | Find Shows                          | Three unlabeled icon-only view toggles (grid / table / calendar), plus tab overflow clipping "Ente…".                                                                                                                                                                                                    | Unlabeled icons are the persona's classic failure mode. They will not press an icon they cannot name.                                                                                                                                                                                 | Add visible text labels or persistent tooltips with accessible names. Let the tab strip wrap.                                                                                                                                                                                              |
| 18  | Medium   | NEW        | buildable | all            | Nav links + dog cards               | Sidebar nav links and every dog-card link resolve to **no accessible name** in the a11y tree — a screen reader announces only "link". Gender/tab controls in the Add Dog dialog are also unnamed.                                                                                                        | This persona disproportionately uses screen readers, zoom, and large-text modes.                                                                                                                                                                                                      | Give links their visible text as accessible name (or `aria-label`). Add an axe check for unnamed interactive elements to CI.                                                                                                                                                               |
| 19  | Medium   | NEW        | buildable | all            | Entry wizard step 3 (Payment)       | _"You'll be taken to our secure checkout to complete payment…"_ appears **twice verbatim** on one screen, plus a third variant _"Your registration will be confirmed once payment is received."_                                                                                                         | Repetition meant as reassurance reads as clutter; the persona re-reads each to check whether it says something new.                                                                                                                                                                   | Keep one statement, placed next to the Submit button.                                                                                                                                                                                                                                      |
| 20  | Medium   | NEW        | buildable | all            | Show detail → run schedule          | Ten consecutive rows read "Time pending · Armband pending · Judge TBD", under a promise that "Times, armbands, judges, and results stay together here."                                                                                                                                                  | The screen answering "where do I need to be?" answers "unknown" ten times. The promise is made before it can be kept.                                                                                                                                                                 | Collapse to one message: "Times and armbands are published closer to the show — we'll notify you." Show the detailed grid once data exists.                                                                                                                                                |
| 21  | Low      | NEW        | cosmetic  | all            | Edit Dog; Records selector          | Raw database values leak into the UI: gender renders **`male`** (lowercase) on Edit vs "Male" on Add; the Records type selector shows **`health`**.                                                                                                                                                      | Minor, but it makes the app look unfinished at exactly the moment the user is entrusting it with records.                                                                                                                                                                             | Route enum display through a shared label formatter.                                                                                                                                                                                                                                       |
| 22  | Low      | NEW        | cosmetic  | all            | Entry wizard step 1                 | Dog names are shouted in ALL CAPS (`BISCUIT`, `BUDDY "SUNRISE GOLDEN BUDDY"`) here and title-case everywhere else. The AKC agreement checkbox label is also ALL CAPS.                                                                                                                                    | All-caps is measurably slower to read and is the least friendly register for this persona.                                                                                                                                                                                            | Use sentence/title case; reserve caps for short eyebrow labels.                                                                                                                                                                                                                            |
| 23  | Low      | NEW        | cosmetic  | all            | Add Dog vs Edit Dog vocabulary      | Add uses tabs "Essential / Registration / Optional details"; Edit uses "Basic Info / More for this dog". Fields also move between tabs (DOB is step-1 on Add, secondary on Edit).                                                                                                                        | The same object described two ways teaches the persona that they are in two different places.                                                                                                                                                                                         | Use one tab vocabulary and one field order for both modes.                                                                                                                                                                                                                                 |
| 24  | Low      | NEW        | cosmetic  | mobile, tablet | Sign-in step 2; My Dogs strip       | The echoed email truncates to `e2e-exhibitor@test.myk9.c…` so the user cannot verify what they typed. The MY DOGS horizontal strip clips mid-word ("Codex Dai…") with no scroll cue.                                                                                                                     | Small trust taxes at moments where the persona wants to double-check.                                                                                                                                                                                                                 | Wrap the email to two lines. Add a fade/arrow affordance on horizontal strips.                                                                                                                                                                                                             |

## Relationship to `exhibitor-journey-completion` (MYK9-71)

Established after the walk, by checking what had actually merged. This explains both the RESOLVED
tags and the ownership of what remains.

**Merged to `main` before this audit ran** — so the walk measured their result, and the two
RESOLVED findings are directly attributable:

| PR                    | What it did                                                       | Effect on this audit                          |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| #1437 (MYK9-73)       | Premium record integrity — forms, dates, filters                  | Baseline #4 (Health search) verified RESOLVED |
| #1438 (MYK9-74)       | Consolidated the dog workspace into Overview/Career/Records       | Baseline #5 (seven tabs) verified RESOLVED    |
| #1439 / #1442 / #1450 | Durable Premium grants, server authorization, unified entitlement | Not re-tested — this account is Free          |

**Slice 4 (its section 6) had not started** as of 2026-07-24 — the branch existed with no commits.
That slice is precisely this audit's STILL-OPEN set, which is why those findings reappeared:

| This audit                             | MYK9-71 task                             | Owner                      |
| -------------------------------------- | ---------------------------------------- | -------------------------- |
| #6 money contradiction                 | 6.1–6.2                                  | MYK9-71                    |
| #10 count reconciliation               | 6.3                                      | MYK9-71                    |
| #7 / #8 entry change & withdrawal      | 6.4–6.5                                  | MYK9-71                    |
| #11 My Payments — **phone width**      | 6.6                                      | MYK9-71                    |
| #11 My Payments — **desktop clipping** | not covered (6.6 scopes itself to 390px) | `exhibitor-ux-remediation` |
| #14 dog record hierarchy               | none — slice 2 already merged            | `exhibitor-ux-remediation` |

**#14 is a defect in shipped work, not pending work.** The Overview/Career/Records consolidation
landed in #1438; the walk then found that Overview still opens on registrations, the same
add-registration action appears three times with three capitalizations, and on a phone the identity
panel sits below the entire tab content. Those are results of the merged structure, so they are not
MYK9-71's to fix.

Partial overlap worth coordinating rather than splitting: MYK9-71 task 7.6 runs an accessibility
pass over Dog Details, Premium forms, Payments, Subscription/Pricing, and the admin grant control.
This audit's #18 covers exhibitor **navigation and dog-card links**, which that sweep does not
include — but whoever runs 7.6 should pick up both.

## Corrections issued after the walk

Two claims in the original draft were wrong and are corrected above. Both were caught while
tracing root causes in source, after the walk closed.

1. **Finding #4 — the stated reason was wrong; the finding itself stands (High).**
   The draft called the breed default _silent_. It is not: [`AddDogPanel/index.tsx:100`](../../apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx)
   and [`RegistrationTab.tsx:42`](../../apps/myk9show/src/components/panels/edit/AddDogPanel/RegistrationTab.tsx)
   disclose it plainly, pinned by a test named _"4.E — no silent Mixed Breed"_. The walk never
   opened the Registration tab, so the disclosure was missed.

   That correction was then over-applied — an interim draft concluded the default was therefore
   "not a defect." **Per the product owner, it is one.** "Mixed Breed" is a _claim about the
   owner's dog_. Telling an exhibitor who has just added a purebred that it is recorded as Mixed
   Breed is offensive however clearly it is explained, and the value is **stored**, so it can flow
   into entry blanks and organization submissions. Disclosure does not rescue an assertion the app
   has no basis to make.

   **Settled position: the dog record carries no breed at all.** Breed exists only on a
   registration; a dog without one displays no breed. This requires the data-model change, since
   `dogs.breed` is `NOT NULL`.

2. **Finding #5's fix was revised twice; the final position is "remove the field."**
   The draft said "make registered name optional on Edit"; a second pass said "collect it on Add"
   because `dogs.name` is `NOT NULL`. Both treated a storage constraint as a requirement. Per the
   product owner, the domain rule is: **a dog has one call name; a registered name belongs to a
   registration with an organization** — e.g. call name "Tera", AKC registered name
   "Maia TeraByte Van Neerland", which may differ again with UKC.

   The schema inverts this (`dogs.name` `NOT NULL` commented _"Registered name"_,
   `dogs.call_name` nullable), and [`AddDogPanel/index.tsx:98`](../../apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx)
   writes `name: formData.callName, callName: formData.callName` — storing the call name in both
   columns to satisfy the constraint. `dog_registrations` already carries `registered_name`,
   `breed`, and `variety` per organization (migration 014).

   **Final fix: remove Registered Name from the base dog record and capture it inside each
   registration.** No migration in this change; normalizing the columns is tracked as a follow-up.

3. **Related, found while tracing the above — flagged separately, not an exhibitor finding.**
   `dogs.akc_number` and its sibling flat registry columns are never written by the app, but are
   still read by AKC submission, printed entry blanks, and dog search. Dogs registered through the
   current UI may therefore carry a null registration number onto official paperwork. Tracked as
   its own task; see design.md § Follow-ups.

4. **Domain rule captured for finding #16.** A dog must be registered to compete, with the sole
   exception of puppies in conformation classes. This makes the wizard's "No registration on file"
   note a **blocking prerequisite** for the sanctioning organization rather than an advisory —
   reflected in the `entry-wizard-guidance` spec.

## Responsive / cross-breakpoint notes

- **Mobile 390×844 — where it breaks.** Sticky form footers overflow horizontally, clipping the
  primary button (#2). Toasts cover those same footers (#1). The dog picker introduces a second
  scrollbar (#13). The dog's About panel is pushed below all tab content (#14). Crucially, the
  **desktop-only caption that disambiguates the `5` entries count is dropped** — mobile shows the
  bare number, so the most confusable surface loses its only explanation (#10).
- **Desktop 1280×800 — the designed target.** Summary cards gain explanatory captions
  ("Upcoming + in review", "2 accepted · 3 pending"), the dog page's three tabs sit comfortably,
  and the About rail is a proper right-hand column. Remaining breakage here is real, not
  width-driven: the payments table still clips its Receipt column (#11), and nav subtitles are
  still truncated (#12). No hover-only affordances were found — actions are visible controls,
  which is correct for this persona.
- **Tablet portrait 834×1112 — mostly inherits desktop.** The persistent 233px sidebar leaves a
  narrow content column; the MY DOGS strip clips mid-word (#24) and card captions truncate
  ("2 accepted · 3 pendi…"). Pedigree stacks into 2×2 rows here with **no clipping** — a visible
  improvement over the baseline's report, though verified only in the empty state.
- **Tablet landscape 1112×834 — healthiest layout.** Card captions render in full; the four
  summary cards and dog strip breathe. Only the entries tab strip clips ("Completed").
- **Light mode:** not walked; the account remained in dark mode. No claim is made about
  light-mode contrast.

## Intentional-design carve-outs

Checked against [`docs/INTENT.md`](../INTENT.md) (Exhibitor — _"This respects my time"_). Nothing
in this report contradicts a documented intent. The findings in fact support it directly:
INTENT's stated anti-patterns include _"requiring re-entry of information the system already
knows"_ (#5), and its guardrails ask _"How many taps?"_ (#7/#8 — a task with **no** completing
tap) and _"What does the error state look like?"_ (#1/#3). No `// INTENT:` comment was
encountered on any surface walked.

## Duplication check (per CLAUDE.md, "consolidate, don't duplicate")

**Does the remediation duplicate an existing page? No new page is justified.**

- Money truth belongs on **My Payments**, referenced by My Shows — not a third balance surface.
- Entry changes belong in the **existing show-detail / registration flow**, with honest scope.
- Dog identity belongs on the **existing dog Overview**, not a new profile page.
- The toast/footer fix is a **shared layout primitive**, not a per-screen patch — fixing it once
  in the toast layer covers every dialog and wizard in the app.

The only structural change recommended is _removal_: collapse the three "Add Registration" CTAs
to one (#14), and delete the duplicated payment reassurance paragraphs (#19).

## What worked well

- Two-step sign-in with echoed email, an **Edit** affordance, show-password toggle, and Forgot link.
- Five-item navigation with plain-language subtitles — the right shape for this persona (if only
  the subtitles were readable).
- Add Dog validation: blocks empty submits, echoes **"Age: 4 years, 4 months"** back, and states
  **"This dog will be registered to your account."**
- The breed helper text is the best copy in the app — it names the exact anxiety ("Not sure of
  the exact breed…") and resolves it without jargon.
- The **"Biscuit added" → "Enter a show"** toast pattern: confirmation and next action in one
  element. This is the model the rest of the app should copy (once it stops covering buttons).
- The entry wizard: visible 4-step stepper, per-class pricing, "In cart" state, running totals,
  handler assignment, and an agreement gate that **explains** why Submit is disabled
  ("Please review and agree to the entry agreement to continue").
- The "No registration on file" warning is genuinely accurate — dogs with AKC numbers correctly
  omit it. Only its lack of a follow-up action is a finding.
- Seven dog tabs are now three, and Records replaces five scattered lock icons with one honest
  read-only banner. Both baseline complaints, both genuinely fixed.

## Method notes and data left behind

- **Created and left in place:** one dog, **Biscuit** (Male, DOB 3/15/2022, registered name
  "Sunnybrook's Buttered Biscuit"). Left intentionally — the user asked for a dog to be added,
  and deleting it would destroy evidence for findings #4 and #5. Delete when no longer needed.
- **Also left behind:** one saved registration draft ("Load Draft (1)") and one item in the cart
  (Biscuit — Container Novice A, $30). No payment was made.
- **Not performed:** Stripe checkout, dog deletion, account deletion, email/push, any secretary-
  or admin-side action.
- **Not walked:** `/subscription`, `/pricing`, check-in and show-day flows, Ringside, and
  Premium create/edit surfaces (gated read-only on this Free account). Baseline findings covering
  those are marked NOT RE-TESTED rather than resolved.
- One earlier observation — an apparent overlap between the "Enter a show" button and the dog
  name at tablet width — was **measured and retracted**: the elements are 24px apart; the
  screenshot caught a mid-animation frame. It is not reported as a finding.
- This report is **audit-only. No application source was changed.**
