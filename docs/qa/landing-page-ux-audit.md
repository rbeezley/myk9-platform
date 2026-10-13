# UX Audit: myK9Show landing page (`/`)

> **Status:** Active
> **Date:** 2026-10-13 · **Surface:** `apps/myk9show/src/pages/Home.tsx`, `src/components/landing/v2/*`
> **Method:** UX-Audit six-pass + scroll-craft taste / feel / verify checklists (MIT, github.com/nateherkai/scroll-craft), adapted to `docs/INTENT.md`. Where the two disagree, INTENT wins (for example the 14px type floor and 44px tap targets).
> **Evidence:** logged-out headless walk of production `https://myk9show.com/` at 1440x900 and 390x844 (production footer reads `v0.9.4 · pre-launch`), computed-style measurements, source read. The waitlist and onboarding forms were **not submitted**, because a submission writes to the production database.
> **Purpose:** input for rebuilding the page from a pre-launch waitlist page into a launch page.

## Measurements

| Measure                    | Desktop 1440                                            | Phone 390            | Bar                                   | Verdict                    |
| -------------------------- | ------------------------------------------------------- | -------------------- | ------------------------------------- | -------------------------- |
| Page length                | 6.4 screens                                             | 11.3 screens         | 8-14 (scroll-craft)                   | OK                         |
| Hero height                | 1053px                                                  | 1519px (1.8 screens) | CTA visible without scrolling         | **Fail on phone**          |
| H1 lines                   | 4 (68px Playfair)                                       | 4 (40px)             | max 2                                 | **Fail**                   |
| Font families              | Playfair Display, Montserrat, JetBrains Mono            | same                 | max 2                                 | **Fail** (mono as costume) |
| Text below 14px            | 67 elements at 10-13px                                  | 76                   | INTENT: never below 14px              | **Fail**                   |
| Tap targets under 44px     | header nav 22px, header buttons 34px, footer links 18px | same                 | INTENT: 44px floor on non-dense pages | **Fail**                   |
| Visible em dashes / arrows | 19 strings                                              | 19                   | none (scroll-craft + house rule)      | **Fail**                   |
| Body contrast              | ink-soft 9.8-10.5:1, muted 5.15-5.53:1                  | same                 | 4.5:1                                 | Pass                       |
| Body measure               | 45-66ch, one 155ch line (the "Free waitlists" card)     | n/a                  | 45-75ch                               | Mostly pass                |
| Horizontal scroll          | none                                                    | none                 | none                                  | Pass                       |
| Blank band above header    | 48px                                                    | 48px                 | none                                  | Fail (source not traced)   |

## Pass 1: Mental model alignment

**What the UI suggests:** a product that does not exist yet. "Waitlist · launching 2026", two waitlist forms, "shipping to a handful of clubs in late 2026", and a `v0.9.4 · pre-launch` stamp.
**What it actually does:** the platform runs live shows: public show pages, online entries, ringside scoring, results.

| UI element                        | User expects           | Actually does                                                                            | Severity |
| --------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- | -------- |
| Waitlist forms (hero + closing)   | "I can't use this yet" | Adds a lead row while the product is already usable                                      | High     |
| "Join the waitlist" header button | A product waitlist     | Same, and it competes with the class-waitlist idea ("Free waitlists") two sections later | Med      |
| "Browse shows" (ghost button)     | Secondary              | The thing most cold visitors came to do                                                  | High     |
| Fake ringside phone (div-built)   | A real screenshot      | A mock with sample dogs                                                                  | Low      |

**Jargon:** "Offline-first", "Replication queues in order", "LTE", "Ringside-resilient", "re-keying", "sanctioning bodies". Fine for a secretary, but a retired exhibitor won't follow them.

## Pass 2: Information architecture

**Current order:** header → photo hero + waitlist form → tagline strip → Who we are (product lineage cards) → For clubs (3 cards) → For exhibitors (4 cards) → Offline ringside → Club onboarding → Closing waitlist → footer.

| Issue                                      | Location                              | Problem                                                                                                      | Recommendation                                                 |
| ------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Repeated promise                           | H1 and the For clubs H2               | "From premium list to final placements, without the paperwork" said twice; the same feeling in adjacent acts | Say it once, then _show_ it (see Rebuild direction)            |
| Three conversion asks                      | hero form, onboarding, closing form   | Waitlist, club request and waitlist again compete; nothing routes by audience                                | Two paths only: _find a show_ and _run your show_              |
| Audiences split by section, not by journey | clubs vs exhibitors                   | A show is one story both roles live through; the split hides how they connect                                | Tell the show lifecycle once and show both views at each stage |
| Lineage before value                       | "Who we are" is section 2             | Trust proof comes before the visitor knows what the product does                                             | Move it near the close                                         |
| Dead anchors                               | footer "For exhibitors" → `#features` | Goes to the clubs section; the exhibitor section has no id                                                   | Fix in the rebuild                                             |

**Hidden but should be visible:** Browse shows as a primary action; fees ("How Our Fees Work" is buried in the footer); any proof the platform is live.
**Prominent but should be secondary:** the waitlist form, product lineage cards, the tagline strip (it restates the lede).

## Pass 3: Affordance clarity

| Element                             | Looks like      | Actually is                | Clear? |
| ----------------------------------- | --------------- | -------------------------- | ------ |
| Footer "Sanctioning" list           | Link column     | Plain text                 | No     |
| Feature card footnote + badge pills | Tags / filters  | Decoration                 | No     |
| Credibility cards (mySWT, myNWT...) | Clickable cards | Static                     | No     |
| "Ziva & Tera" pill on the photo     | Button          | Caption                    | No     |
| Header nav links (22px tall)        | Links           | Links, under the tap floor | Partly |

**Fixes:** take the pill styling off non-interactive text, raise every link and button to 44px, and make the footer columns either all links or visibly plain.

## Pass 4: Cognitive load

| Screen            | Decisions                                                                                             | Can be reduced?                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Desktop header    | 6 actions: 3 anchors, Browse shows, Sign in, Join the waitlist                                        | 3: Find a show, Run your show, Sign in            |
| Hero              | 6 text elements (caption, eyebrow, H1, lede, form title, disclaimer) + a 3-field form with role chips | ≤4 text elements; one primary button per audience |
| Each feature card | 4 text layers (title, body, footnote, badge), and footnote and badge say the same thing               | Title + one sentence                              |

**Cognitive load score:** Medium. Each section is readable, but the page asks the same question three times and splits one journey into two parallel feature catalogues.

## Pass 5: State coverage

| Component      | Empty | Loading                    | Success                                   | Error              | Notes                                                                           |
| -------------- | ----- | -------------------------- | ----------------------------------------- | ------------------ | ------------------------------------------------------------------------------- |
| Waitlist form  | n/a   | not exercised              | not exercised                             | not exercised      | Not submitted on production; it is being removed in the rebuild anyway          |
| ClubOnboarding | n/a   | Yes (`checkingExisting`)   | Yes (status card for an existing request) | Yes (`error`)      | Signed-out path routes to sign-in/sign-up first. Keep this flow and re-house it |
| Hero image     | n/a   | eager + fetchPriority high | Yes                                       | No fallback colour | Fine                                                                            |

No dead ends found on the static page. The open question is the signed-in visitor: `/` redirects them to their dashboard, so the landing page only ever serves logged-out visitors. Design for that.

## Pass 6: Flow integrity

**Flow A: exhibitor wants to enter a show (phone).**

| Step | Action                                  | Friction                                                                              | Severity |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| 1    | Lands on `/`                            | Photo fills the fold; no primary CTA visible, only ghost "Browse shows" in the header | High     |
| 2    | Scrolls                                 | Reads a waitlist form and assumes entries aren't open yet                             | High     |
| 3    | Finds "Browse shows" back in the header | Works; `/shows` is public                                                             | None     |

**Flow B: secretary wants their club on myK9Show.** They have to scroll about 7,000px on a phone to reach "Run your next trial", then sign up, then fill the request form. That's completable, but the hero gives them only a waitlist.

**Flow verdict:** completable with friction. The friction comes from the pre-launch framing, not from broken code.

## scroll-craft checklist: results

**Fails**

- Hero rules: H1 is 4 lines (max 2), more than 4 text elements, CTA below the fold on a phone, and an eyebrow over the H1.
- Refuse list: three equal feature columns used twice; identical cards as page structure; an eyebrow above 6 of 8 section headings (max 1 in 3); a version stamp on a marketing page; a pill overlaid on the photo; a div-built fake phone screenshot; monospace as a costume on stat lines; 19 em dashes and arrows.
- Feeling curve: H1 and the For clubs H2 produce the same feeling back to back. There is no single peak; ringside comes closest but gets the same room as the card grids.
- Ending: the close repeats the hero form instead of resolving.
- Typography: three families.
- Colour: cream canvas + clay accent + espresso text is the exact palette scroll-craft calls the "premium-consumer trap". The terracotta is the brand, so treat this as a judgment call, not a defect.

**Passes**

- Body contrast, measured against the actual section grounds.
- Measure is mostly within 45-75ch.
- Tracking tightens with size (H1 -1.36px at 68px; body normal).
- Reduced motion is honoured on the anchor scrolls (`Home.tsx`).
- No horizontal scroll; the hero image is sized and prioritised.

## Claims to verify before re-use

Scroll-craft's rule is "only real numbers, verified product details". Each of these needs a shipped, user-visible feature behind it before it goes on the launch page:

- "Push notifications" (Live from ringside card). The service worker has push code; confirm exhibitors can opt in.
- "Qualifying rate by element. Time-under-par by level." Found only in scoring types; no exhibitor stats page located.
- "Health records and training journal alongside thirteen years of placements". Types exist; confirm the pages ship and that mySWT/myNWT history is actually imported.
- "Browse by sanctioning body, level, and distance". Confirm distance filtering on `/shows`.
- "Other sites charge you just to wait". This is a competitor claim; keep it only if true and defensible.

## Summary

**Overall UX health:** Needs work. The page is well made but tells the wrong story for launch.

### High

| Finding                                                                       | Pass | Effort  |
| ----------------------------------------------------------------------------- | ---- | ------- |
| Pre-launch framing throughout (waitlist ×2, chip, version stamp, "late 2026") | 1    | Rebuild |
| No primary CTA in the phone fold; Browse shows is a ghost button              | 6    | Small   |
| Three competing conversion asks, no audience routing                          | 2    | Rebuild |
| Text at 10-13px and tap targets under 44px (INTENT floors)                    | 3/4  | Small   |

### Medium

| Finding                                          | Pass | Effort  |
| ------------------------------------------------ | ---- | ------- |
| Promise repeated (H1 = clubs H2); no single peak | 2    | Rebuild |
| Feature-card grids ×2, footnote+badge redundancy | 4    | Rebuild |
| Unverified product claims                        | 1    | Small   |
| Jargon (replication, LTE, offline-first)         | 1    | Small   |

### Low

- 19 em dashes and arrows; 3 font families; eyebrows everywhere; fake phone mock; footer dead anchor and non-link "Sanctioning" list; 48px blank band above the header.

### Quick wins (if anything ships before the rebuild)

- Promote "Browse shows" to a filled primary button and show it on phones.
- Drop the `v0.9.4 · pre-launch` stamp and the status chip once launch is declared.

## Rebuild direction: the show lifecycle as the story

The current H1 already names the arc ("from premium list to final placements"). The rebuild should **show** that arc instead of restating it. Tell one show's life in six stages and show both sides of each:

| #   | Stage               | Club / secretary side                        | Exhibitor side                        | Intended feeling        |
| --- | ------------------- | -------------------------------------------- | ------------------------------------- | ----------------------- |
| 1   | Set up the show     | Premium list built from rules already loaded | n/a                                   | "It already knows"      |
| 2   | Entries open        | Entries arrive; no re-keying                 | Find the show, enter in a minute      | "That was quick"        |
| 3   | Before show day     | Running order, catalog, armbands ready       | Know when and where to be             | "Everything is handled" |
| 4   | **Show day (peak)** | Ringside scoring with no signal              | Live ring status from the parking lot | "It just kept working"  |
| 5   | Results             | Placements calculated, results published     | "There it is"                         | Relief                  |
| 6   | After               | Reports done in clicks                       | Titles and history build over time    | Pride                   |

Then trust (the RyKris lineage since 2013), then a quiet close with two paths: **Find a show** and **Bring your club**.

**Motion budget (INTENT: calm, not flashy).** Use scroll-craft's craft rules, not its engine:

- No video scrubbing, no scroll-jacking, no generated imagery.
- A sticky stage rail that advances as each stage scrolls into view, using CSS scroll-driven animation or IntersectionObserver. Motion only on `transform` and `opacity`, under 300ms.
- Under reduced motion it becomes a plain numbered list, fully readable.
- Use real product screenshots per stage (they already exist for the user guides) in place of div mock-ups. Stage 4 gets the most room and the best asset.
- One label per intent across header, hero and close.

Duplication check (CLAUDE.md): the rebuild replaces `landing/v2` sections and adds no new route. "Bring your club" re-houses the existing `ClubOnboarding` flow, and "Find a show" links the existing `/shows`.
