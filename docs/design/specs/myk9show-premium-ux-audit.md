# UX Audit: myK9Show Landing & First Impressions

**Date:** 2026-03-14
**Auditor:** Claude
**Sources:** Codebase analysis (Hero, FeaturesSection, Pricing, ClubOnboardingForm, FAQSection, AppHeader, SignInPage, design tokens, INTENT.md)
**Checklist:** [Premium Website Checklist](premium-website-checklist.md)

---

## Pass 1: Mental Model Alignment

**What UI suggests:** A tech-forward SaaS tool for "managing dog shows" — aimed at tech-savvy event managers.

**What it actually is:** A platform for dog show people (many retired, non-technical) who need registration, scoring, results, and career tracking. Per INTENT.md: "The software disappears so the dogs can shine."

**Misalignment gaps:**

| UI Element                                                                                                          | User Expects                                          | Actually Does                                                                   | Severity   |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| Hero headline "Welcome to myK9Show"                                                                                 | To understand what this does and why they should care | Generic welcome — no value proposition, no audience identification              | **High**   |
| Hero subtitle "A comprehensive solution for managing dog shows, events, registrations, scoring, reporting and more" | To feel like this is _for them_                       | Reads like a feature dump aimed at nobody in particular — corporate SaaS copy   | **High**   |
| Robot dog logo                                                                                                      | A warm, familiar, dog-community product               | Feels like an AI/tech startup — "blue glowing eyes" in alt text reinforces this | **Medium** |
| Hero CTA "View Premium Pricing Plans"                                                                               | A reason to explore                                   | Jumps to pricing before demonstrating value — feels sales-y                     | **High**   |
| Hero search box "Search for upcoming shows..."                                                                      | A functional search                                   | Hardcoded suggestions, no actual search execution on this page                  | **Medium** |
| Feature descriptions ("powerful filtering", "comprehensive tools", "informed decision-making")                      | Plain language                                        | Corporate jargon that INTENT.md explicitly warns against                        | **Medium** |
| FAQ answers ("Refunds are processed automatically", "Digital certificates are emailed")                             | Detailed, helpful answers                             | Generic placeholder-quality answers that don't build trust                      | **Medium** |

**Jargon found:** "Streamlined Entry Management", "Professional Payment Processing", "Performance Analytics Dashboard", "comprehensive reporting tools for informed decision-making" — these are software-vendor language, not dog-people language.

---

## Pass 2: Information Architecture

**Current structure (landing page):**

1. Hero (logo + headline + search + pricing CTA)
2. Features (6 generic feature cards)
3. Upcoming Shows (carousel)
4. Pricing (Free vs Premium)
5. Club Onboarding Form
6. FAQ (4 basic questions)

**IA issues:**

| Issue                    | Location                  | Problem                                                                                                 | Recommendation                                                                      |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| No audience segmentation | Hero                      | One message for everyone — exhibitors, secretaries, clubs, judges all land here                         | Add role-specific entry points: "I'm an Exhibitor", "I Run Shows", "I'm a Judge"    |
| Value before price       | Hero → Pricing            | CTA goes straight to pricing; shows come _after_ features                                               | Move upcoming shows higher; let users see the product before the price tag          |
| No social proof          | Entire page               | Zero testimonials, club logos, user counts, or credibility markers                                      | Add a social proof section between Features and Pricing                             |
| Missing "How it Works"   | Between Hero and Features | Users don't understand the flow — browse → enter → compete → results                                    | Add a 3-4 step visual flow                                                          |
| Club onboarding buried   | Section 5                 | Clubs are a key acquisition channel but the form is below pricing and requires sign-in                  | Consider elevating club CTA or creating a dedicated `/for-clubs` page               |
| FAQ is thin              | Section 6                 | 4 generic answers that don't address real concerns (cost, data privacy, who uses this, offline support) | Expand with real user questions; add "Is my data safe?" and "Does it work offline?" |

**Visibility problems:**

- **Hidden but should be visible:** What the product looks like (no screenshots/mockups), who uses it (no logos/testimonials), how it works (no step-by-step)
- **Prominent but should be secondary:** Pricing CTA in hero, search box on landing page (search is a power-user feature, not a landing-page hook)

---

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element                                          | Looks Like                              | Actually Is                                                   | Clear? |
| ------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------- | ------ |
| Hero search box                                  | Functional search input                 | Fake — shows hardcoded suggestions, no results page           | **No** |
| Feature cards (hover effects)                    | Clickable cards linking to detail pages | Non-interactive — cursor:pointer but no onClick/href          | **No** |
| "View Premium Pricing Plans" button              | Primary CTA                             | Outline variant (low visual weight for a primary action)      | **No** |
| Pricing "Get Started" (Free tier)                | Sign-up flow                            | Does nothing (priceId is null, handleSubscribe returns early) | **No** |
| Both pricing cards have identical border-primary | Equal weight                            | Free vs Premium should have clear visual hierarchy            | **No** |

**False affordances:**

- Feature cards use `cursor-pointer` and elaborate hover animations but aren't clickable — users will click and nothing happens
- Hero search shows a dropdown but has no search functionality

**Hidden affordances:**

- The `#get-started` anchor for club onboarding exists but isn't linked from the nav
- Theme toggle, command palette (Cmd+K), keyboard shortcuts exist but aren't discoverable

**Recommended fixes:**

1. Remove `cursor-pointer` from feature cards or make them link to relevant pages
2. Either make the hero search functional or replace it with a simpler CTA
3. Make the hero CTA a solid/default button variant, not outline
4. Differentiate pricing cards visually — muted border for Free, primary border + "Most Popular" badge for Premium
5. Make the Free tier button navigate to sign-up

---

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step          | Decisions Required                                         | Can Be Reduced?                                              |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| Hero                 | Search? View pricing? Scroll? (3 options, none compelling) | Single clear CTA: "Find a Show" or role-based entry          |
| Features section     | Read 6 cards, understand value                             | Reduce to 3 hero features with a "See all features" link     |
| Pricing              | Choose Free or Premium                                     | Good — only 2 options. But lacks context on _why_ to upgrade |
| Club onboarding form | 7 fields (4 required)                                      | Smart — pre-fills from auth. Good use of optional labels     |
| Sign-in page         | Email/password or Google                                   | Good — standard pattern, well-executed                       |

**Missing defaults:**

- No default organization selected in club onboarding (reasonable — can't assume)
- Hero doesn't guide users toward their most likely next action

**Unnecessary complexity:**

| Complexity                  | Who Needs It                            | Recommendation                                                      |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| Search box on landing page  | Returning users who know what they want | Move to authenticated dashboard; replace on landing with simple CTA |
| 6 feature cards all at once | Nobody reads all 6                      | Show 3, offer "Learn more"                                          |
| Pricing on landing page     | Ready-to-buy visitors                   | Keep, but move below social proof and product screenshots           |

**Cognitive load score:** **Medium** — The landing page isn't overwhelming, but it lacks focus. Users see features and pricing without first understanding _why this matters to them_.

---

## Pass 5: State Coverage

### Hero

| State          | Implemented? | Quality | Issue                                                |
| -------------- | ------------ | ------- | ---------------------------------------------------- |
| Default        | Yes          | Good    | Layout is clean, responsive                          |
| Search focused | Yes          | Poor    | Shows fake suggestions with no backing functionality |
| Mobile         | Yes          | Good    | Stacks properly                                      |

### Pricing

| State                  | Implemented? | Quality | Issue                                                         |
| ---------------------- | ------------ | ------- | ------------------------------------------------------------- |
| Unauthenticated        | Yes          | Good    | Subscribe redirects to sign-in                                |
| Authenticated          | Yes          | Good    | Creates checkout session                                      |
| Error (checkout fails) | Yes          | Poor    | `logger.error` only — no user-facing error message            |
| Free tier click        | Yes          | Poor    | Silent no-op (priceId is null, handleSubscribe returns early) |

### Club Onboarding Form

| State                       | Implemented? | Quality  | Issue                                          |
| --------------------------- | ------------ | -------- | ---------------------------------------------- |
| Unauthenticated             | Yes          | **Good** | Clear sign-in gate with helpful messaging      |
| Loading (checking existing) | Yes          | Good     | Shows "Checking request status..."             |
| Existing request            | Yes          | **Good** | Shows status with submitted date               |
| Form (default)              | Yes          | Good     | Pre-fills from auth, clear required fields     |
| Submitting                  | Yes          | Good     | Disabled button + "Submitting..."              |
| Success                     | Yes          | **Good** | Friendly confirmation with 24-hour expectation |
| Error (validation)          | Yes          | Good     | Inline error message                           |
| Error (network/auth)        | Yes          | Good     | Distinguishes auth expiry from generic errors  |

**Dead ends found:**

- Free tier "Get Started" button does nothing
- Feature cards look clickable but aren't

**Missing error handling:**

- Pricing checkout failure is logged but not shown to the user

---

## Pass 6: Flow Integrity

**Primary flow tested:** New visitor → Understand product → Decide to sign up

| Step | Action                               | Friction                                                                                               | Severity   |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------- |
| 1    | Land on homepage                     | Hero doesn't tell me who this is for or why I should care                                              | **High**   |
| 2    | Read hero subtitle                   | "A comprehensive solution for managing dog shows..." — generic, doesn't differentiate from competitors | **Medium** |
| 3    | See CTA "View Premium Pricing Plans" | Pricing before value — I haven't seen the product yet                                                  | **High**   |
| 4    | Scroll to features                   | 6 cards with software-speak descriptions; none show the actual product                                 | **Medium** |
| 5    | Scroll to upcoming shows             | First real content — actual shows. This should be higher                                               | **Low**    |
| 6    | Scroll to pricing                    | Clear 2-tier structure, but no context on what I'm getting                                             | **Medium** |
| 7    | Click "Get Started" (Free)           | Nothing happens                                                                                        | **High**   |
| 8    | Click "Subscribe Now" (Premium)      | Redirects to sign-in (good), but I still don't know what I'm buying                                    | **Medium** |
| 9    | Club onboarding section              | Good flow, but I had to scroll past pricing to find it                                                 | **Low**    |
| 10   | FAQ section                          | 4 thin answers that don't address real concerns                                                        | **Medium** |

**Abandonment risks:**

- Step 1-2: Visitor can't tell if this is for them → bounce
- Step 3: Feels sales-y before establishing trust → bounce
- Step 7: Dead click on "Get Started" → frustration → bounce
- No screenshots or product previews anywhere → "What does this actually look like?"

**Recovery gaps:**

- Missing back/undo: N/A (single page)
- No cancel option: N/A
- Destructive with no confirm: N/A

**Flow verdict:** **Completable with significant friction** — A motivated user can sign up, but the landing page doesn't sell the product or guide users effectively.

---

## Premium Checklist Scorecard

| Checklist Area                 | Score | Key Issues                                                                                                                                     |
| ------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Foundation: Intentional** | 4/10  | Generic headline, no clear audience, CTA jumps to pricing                                                                                      |
| **2. Bespoke Assets**          | 3/10  | All Lucide icons, no product screenshots, no custom illustrations                                                                              |
| **3. Brand Strategy**          | 6/10  | Good color palette (teal/cream), good font pairing (Montserrat/Playfair), but Playfair underused; robot logo conflicts with warm brand intent  |
| **4. Subtle Animation**        | 7/10  | FadeIn scroll animations are good; feature card hovers are slightly overdone per INTENT.md "calm over clever"; respects prefers-reduced-motion |
| **5. Strategic Structure**     | 4/10  | No social proof, no "how it works", no audience segmentation, pricing before value, dead CTA on Free tier                                      |
| **6. Client Autonomy**         | N/A   | SaaS — users manage their own content                                                                                                          |
| **7. Handover & Care**         | N/A   | SaaS                                                                                                                                           |

**Overall: 24/50 (applicable sections)**

---

## Summary

**Overall UX health:** Needs Work

### Critical (Fix immediately)

| Finding                                            | Pass | Impact                                                           | Effort                                                   |
| -------------------------------------------------- | ---- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| Free tier "Get Started" button is a dead click     | 5    | Users try to sign up and nothing happens → immediate abandonment | Low — navigate to `/sign-up`                             |
| Hero CTA goes to pricing before establishing value | 6    | First-time visitors see a price before understanding the product | Low — change CTA text/destination                        |
| Feature cards look clickable but aren't            | 3    | False affordance creates frustration                             | Low — remove cursor-pointer and hover lift, or add links |
| Hero search box is non-functional                  | 3    | Prominent fake UI undermines trust                               | Medium — replace with CTA or make functional             |

### High Priority (Fix soon)

| Finding                                  | Pass | Impact                                                                             | Effort                                          |
| ---------------------------------------- | ---- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| No social proof anywhere                 | 2    | Visitors have no reason to trust the platform                                      | Medium — add testimonials or club logos section |
| Generic, jargon-heavy copy               | 1    | Dog people don't relate to "comprehensive solution" and "informed decision-making" | Medium — rewrite in dog-show language           |
| No product screenshots or previews       | 2    | Visitors can't see what they're signing up for                                     | Medium — add 2-3 app screenshots                |
| No "How it Works" section                | 2    | Users don't understand the flow                                                    | Low — add 3-step visual                         |
| Pricing checkout error not shown to user | 5    | Silent failure on payment                                                          | Low — add toast/alert on catch                  |

### Medium Priority (Plan for)

| Finding                                     | Pass | Impact                                                                                                     | Effort                                        |
| ------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| No audience segmentation on landing         | 2    | Exhibitors, clubs, and judges all see the same generic page                                                | High — role-based hero or entry points        |
| Robot logo conflicts with warm brand intent | 1    | INTENT.md says "calm, competent helper" — robot says "tech startup"                                        | High — brand/design decision                  |
| Playfair Display font barely used           | 3    | Nice font pairing wasted — headings default to Montserrat                                                  | Low — apply Playfair to section headings      |
| Feature card hover animations too elaborate | 4    | Scale + rotate + pulse ring + underline animation per INTENT.md "no animations for the sake of animations" | Low — simplify to subtle shadow/border change |
| FAQ section is thin and generic             | 2    | Doesn't address real concerns (data privacy, offline, who uses this)                                       | Low — expand with real questions              |

### Low Priority (Nice to have)

| Finding                                           | Pass | Impact                            | Effort                        |
| ------------------------------------------------- | ---- | --------------------------------- | ----------------------------- |
| Both pricing cards have identical border styling  | 3    | No visual hierarchy between tiers | Low                           |
| Club onboarding form is below pricing             | 2    | Key acquisition path is buried    | Low — add nav link or elevate |
| Sign-in page uses "myK9Show" text instead of logo | 1    | Minor brand inconsistency         | Low                           |

### Quick Wins (High impact, low effort)

1. **Free tier "Get Started" → navigate to `/sign-up`** — one line fix
2. **Hero CTA → "Find a Show" linking to `/shows`** — demonstrates product, not price
3. **Remove `cursor-pointer` from feature cards** — eliminates false affordance
4. **Add `toast` on pricing checkout failure** — prevents silent errors
5. **Apply `font-display` (Playfair) to section headings** — instant typography upgrade

### Top 5 Recommendations

1. **Rewrite the hero** — Lead with who it's for and the problem it solves: "Dog shows shouldn't be paperwork. Enter shows, track titles, and manage your dogs — all in one place." Add a "Find a Show" CTA.
2. **Add social proof** — Even a simple "Trusted by X clubs" with logos, or 2-3 testimonials from exhibitors/secretaries.
3. **Show the product** — Add 2-3 screenshots or a short walkthrough. People need to _see_ what they're getting.
4. **Fix dead interactions** — Free tier button, feature card hover, hero search. Every clickable-looking thing must do something.
5. **Rewrite copy in dog-show language** — Replace "Streamlined Entry Management" with "Enter shows in 30 seconds." Replace "Performance Analytics Dashboard" with "See your dog's career at a glance." Match the voice in INTENT.md.
