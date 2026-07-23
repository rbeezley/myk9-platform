# Blog Content Calendar — First 12 Posts

**Status:** `drafted`

Ideas ordered by support-deflection priority, not publish date. Actual publish schedule depends on: (a) the workflow being Phase 0 verified, (b) screenshots ready from the shot list, and (c) the post being reviewed against the live app.

Link each post to the KB article it supplements — do not duplicate full KB steps in the post.

---

## Secretary / Show-Day Posts (4 posts)

### Post S-1 — What myK9Show does on show day

**Audience:** Secretary, club decision-maker
**Category:** secretary-tips
**Customer question:** "What does the secretary actually do with myK9Show during a live show?"
**Main takeaway:** The Show Desk replaces the secretary's clipboard: check-in, scratch, move-up, announcements, and access codes in one place — without leaving the page.
**Related guide:** `docs/user-guides/secretary-guide.md` § 7 Show Desk
**Related KB:** `handle-a-scratch`, `handle-move-up`
**Support-deflection value:** High — the most common "how does this actually work?" demo question.
**Screenshot needed:** S-15 (Show Map), S-19 (Tools panel)
**Status:** Blocked on Phase 0 (screenshots) — outline ready

---

### Post S-2 — How to set up your first show

**Audience:** Secretary (first-time)
**Category:** secretary-tips
**Customer question:** "How do I get started — what do I set up first?"
**Main takeaway:** The Create Show wizard guides you through show details, trials, classes, and judge assignments in one flow. You can publish and accept entries the same day.
**Related guide:** `docs/user-guides/secretary-guide.md` § 2 Create a Show
**Related KB:** `create-a-show`
**Support-deflection value:** High — reduces onboarding friction for new secretaries.
**Screenshot needed:** S-02, S-04
**Status:** Blocked on Phase 0 (screenshots) — outline ready

---

### Post S-3 — Reviewing registrations: what needs attention and when to act

**Audience:** Secretary
**Category:** secretary-tips
**Customer question:** "When do I approve entries? Do I have to do them one at a time?"
**Main takeaway:** New Show Registrations appear in **Needs review** after submission. Focus one registration to act on its child Entries, or select several registrations and use the floating toolbar for eligible bulk actions. Queue counts always match the registrations shown.
**Related guide:** `docs/user-guides/secretary-guide.md` § 4 Entry Management
**Related KB:** `approve-entries`
**Support-deflection value:** Medium — most secretaries figure this out after one show.
**Screenshot needed:** S-07, S-09
**Status:** Blocked on Phase 0 (screenshots) — outline ready

---

### Post S-4 — How AKC results submission works

**Audience:** Secretary, club decision-maker
**Category:** secretary-tips
**Customer question:** "How does the AKC XML submission work? Do I still have to fill anything out manually?"
**Main takeaway:** The platform generates the AKC XML from scored data. The secretary verifies in Results Control, releases results to exhibitors, then downloads and emails the XML to `eresults@akc.org`. No manual data entry.
**Related guide:** `docs/user-guides/secretary-guide.md` § 9 Submit to AKC
**Related KB:** (to be created: `akc-xml-submission`)
**Support-deflection value:** High — the most common "does it really do everything?" evaluation question.
**Screenshot needed:** S-22, S-23
**Status:** Blocked on Phase 0 (screenshots) — outline ready

---

## Exhibitor / Self-Service Posts (4 posts)

### Post E-1 — Your entry timeline: what to expect after you pay

**Audience:** Exhibitor
**Category:** exhibitor-tips
**Customer question:** "I paid — why does my entry still say Pending? When will I know if I'm in?"
**Main takeaway:** Paying creates a Pending entry. The secretary reviews and accepts it (or moves it to the waitlist). You see every status change in My Shows — no need to email anyone.
**Related guide:** `docs/user-guides/exhibitor-guide.md` § 5 Track Your Entry
**Related KB:** `entry-status`
**Support-deflection value:** Very high — the single most common exhibitor question during launch.
**Screenshot needed:** E-09, E-10
**Status:** Blocked on Phase 0 (screenshots) — outline ready

---

### Post E-2 — How to enter a show online for the first time

**Audience:** Exhibitor (first-time)
**Category:** exhibitor-tips
**Customer question:** "I've never entered online before — is it complicated? What do I need?"
**Main takeaway:** Two things: an account and a dog profile. Then browse shows, pick your class, and pay by card. The whole process takes a few minutes.
**Related guide:** `docs/user-guides/exhibitor-guide.md` § 1–4
**Related KB:** `enter-a-show`
**Support-deflection value:** High — reduces "I don't know how to start" calls before launch.
**Screenshot needed:** E-01, E-06
**Status:** Blocked on Phase 0 (screenshots) — outline ready

---

### Post E-3 — Finding your run order and checking in on show day

**Audience:** Exhibitor
**Category:** exhibitor-tips
**Customer question:** "Where do I find out when I run? How do I check in?"
**Main takeaway:** The run order is in the Classes tab on the show detail page. Check-in opens on show day from the My Entries card — one tap, no paper form.
**Related guide:** `docs/user-guides/exhibitor-guide.md` § 6–7
**Related KB:** `find-run-order`, `check-in`
**Support-deflection value:** High — common show-day confusion for first-time online exhibitors.
**Screenshot needed:** E-12, E-14
**Flags:** Also links to the OPEN-TODOS run-order navigation gap (once fixed — deep-link from entry card to Classes tab).
**Status:** Blocked on Phase 0 (screenshots) — outline ready

---

### Post E-4 — What Q, NQ, and "results released" mean

**Audience:** Exhibitor
**Category:** exhibitor-tips
**Customer question:** "I saw a badge on my entry — what does Q mean? When do results show up?"
**Main takeaway:** Q = qualified. NQ = not qualified. Results appear as soon as the secretary releases them after the class finishes. You see your placement and time, not just Q/NQ.
**Related guide:** `docs/user-guides/exhibitor-guide.md` § 8 View Results
**Related KB:** (to be created: `view-results`)
**Support-deflection value:** Medium — reduces "I can't find my results" questions after show day.
**Screenshot needed:** E-16
**Status:** Blocked on Phase 0 (screenshots) — outline ready

---

## Club / Payment / Treasurer Posts (2 posts)

### Post C-1 — How show payouts work for clubs using myK9Show

**Audience:** Club president, treasurer
**Category:** club-operations, payments-explained
**Customer question:** "When do we get paid? How does the money actually get to our bank account?"
**Main takeaway:** Exhibitors pay by card at checkout. Stripe holds the funds and initiates a payout to the club's bank account after the show window closes — typically 2–7 business days. The club sees the full breakdown per show.
**Related guide:** `docs/user-guides/club-admin-guide.md` § 5 Payout History
**Related KB:** `payout-timing`
**Support-deflection value:** Very high — the first question every treasurer asks before committing to the platform.
**Screenshot needed:** C-05 (blocked: Stripe sandbox walkthrough)
**Status:** Blocked on Phase 0 + Stripe sandbox — outline ready

---

### Post C-2 — What "Stripe is contacting us" means (and why it's not a scam)

**Audience:** Treasurer
**Category:** payments-explained
**Customer question:** "We got an email from Stripe asking for our tax ID and bank info — is this legit? Did you send it?"
**Main takeaway:** Stripe (not myK9Show) handles payment processing and must verify the club's identity to deposit funds legally. The identity verification email comes from Stripe directly — it's expected, not a scam.
**Related guide:** `docs/user-guides/club-admin-guide.md` § 4 Stripe Onboarding
**Related KB:** `stripe-under-review`, `stripe-onboarding`
**Support-deflection value:** Very high — guaranteed to be asked by every club treasurer who sees a Stripe email for the first time.
**Screenshot needed:** C-04 (blocked: Stripe sandbox walkthrough)
**Status:** Blocked on Phase 0 + Stripe sandbox — outline ready

---

## Platform / Trust Posts (2 posts)

### Post P-1 — How myK9Show works offline at the venue

**Audience:** Secretary, club decision-maker, judge
**Category:** show-day-reliability
**Customer question:** "What happens if the venue has no signal? Does everything just stop working?"
**Main takeaway:** Show-day operations — check-in, Show Map, and scoring — are offline-first. They continue without signal. Actions queue locally and sync automatically when connection returns. The "Offline ready" indicator is normal, not an error.
**Related guide:** `docs/user-guides/secretary-guide.md` § 7 Show Desk; `docs/user-guides/judge-steward-quickstart.md` § offline
**Related KB:** (to be created: `offline-mode`)
**Support-deflection value:** High — the most important pre-sale trust question for clubs in rural venues.
**Screenshot needed:** None practical (offline state is hard to screenshot convincingly — describe the indicator in prose).
**Status:** Outline ready — not gated on screenshots

---

### Post P-2 — What's new: bulk entry approval for secretaries

**Audience:** Secretary
**Category:** release-notes
**Customer question:** "Is there a faster way to approve a lot of entries at once?"
**Main takeaway:** Bulk-select lets the secretary check multiple entries and approve them all in one action. No more one-at-a-time clicking when a new show fills up overnight.
**Related guide:** `docs/user-guides/secretary-guide.md` § 4 Entry Management
**Related KB:** `approve-entries`
**Support-deflection value:** Medium — reduces "how do I approve 50 entries?" tickets.
**Screenshot needed:** S-09
**Status:** Blocked on Phase 0 (screenshots) — outline ready
**Note:** This serves as a template for future release-notes posts. Content will need to be updated to reflect whichever feature is most recently shipped when the post is actually published.

---

## Post Publish Order (recommended)

| Priority | Post | Why first |
|---|---|---|
| 1 | E-1 — Entry timeline | Deflects #1 exhibitor question; no Stripe dep |
| 2 | C-2 — Stripe contact legitimacy | Deflects #1 treasurer panic; needed before first club onboards |
| 3 | S-1 — Show desk on show day | Deflects #1 secretary demo question |
| 4 | P-1 — Offline reliability | Trust-builder for clubs; no screenshot dep |
| 5 | E-2 — Enter online first time | Onboarding for first exhibitor cohort |
| 6 | S-2 — First show setup | Onboarding for first secretary cohort |
| 7 | E-3 — Run order + check-in | Show-day self-service |
| 8 | C-1 — Payout timing | Needed before first show closes |
| 9 | S-3 — Approving entries | Secretary efficiency |
| 10 | S-4 — AKC XML submission | Evaluation / closeout confidence |
| 11 | E-4 — Results and Q/NQ | Post-show self-service |
| 12 | P-2 — Release notes template | Ongoing, post-launch |

All posts are gated on Phase 0 except P-1 (offline — prose-only) and C-2 (Stripe contact — prose-only, needs Stripe sandbox for the screenshot but the post body does not).
