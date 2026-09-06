# myK9Show landing page review

Date: September 5, 2026 (America/Chicago). Auditor: Codex.

Scope: public homepage and the first step into show discovery and fees. Sources: https://myk9show.com/, https://myk9show.com/shows, https://myk9show.com/fees; desktop browser inspection; local landing v2 components; docs/INTENT.md. No live forms were submitted, accounts created, or production files changed. Local source observations are distinguished from live observations; deployment parity was not established.

Recommendation: preserve the warm, credible dog-sport identity. Replace the waitlist-centered hierarchy with clear club onboarding and exhibitor discovery paths, show the actual product earlier, and make fees and launch availability explicit. This is a transition in purpose, not a reason to discard the visual identity.

The prototype compares three structures: A keeps photography central; B leads with the secretary workflow; C gives clubs and exhibitors equal entry paths. Recommend A as the starting point, with B's actual-product evidence brought immediately below the hero. B alone is appropriate if club acquisition is the main campaign objective.

## Pass 1: Mental Model Alignment

**What UI suggests:** a scent-sport platform launching in 2026, collecting waitlist registrations.

**What it actually does:** also exposes show browsing, sign-in, and an account-gated club onboarding request. Local waitlist code gives club/secretary submissions different success messaging from exhibitor/judge submissions.

| UI element | User expects | Observed behavior or claim | Severity |
|---|---|---|---|
| Waitlist alongside “Run your next trial” | A clear answer about availability | Future availability and current onboarding coexist without an up-front explanation | High for launch |
| “Browse shows” | Real events suitable for discovery | Public directory shows three “MYK9-109 Load Show” entries; fourth event's authenticity not established | High |
| “No conflicts, no lost scores” | Unconditional reliability | Absolute marketing promise; this audit does not establish that guarantee | High claim-review priority |
| Offline paragraph includes exhibitors and live updates | All roles see fresh information without a connection | Copy does not clearly distinguish local scoring from cross-device communication | High |
| “Forever,” “never lost,” and 2027 sport dates | Durable commitments | Strong promises presented without qualifications or launch evidence | Medium |

**Jargon found:** “replication queues,” “offline-first,” “Modern Web,” and “ringside-resilient.” Prefer “Prepare your devices online. Record scores without a signal. Share updates when connected.” Keep familiar sport terms such as premium list and placements.

## Pass 2: Information Architecture

**Current structure:** navigation → large dog photo → headline and waitlist form → highlights → company history → club features → exhibitor features → offline example → account-gated onboarding → another waitlist form → footer.

| Issue | Location | Problem | Recommendation |
|---|---|---|---|
| Hero delays the next step | First desktop screen | At the observed viewport, photo consumes much of the screen; the form submission is below the fold | Put compact copy and two actions beside the photo |
| Product proof arrives late | Offline example | Visitors read many claims before seeing software | Bring one sanitized real screenshot near the hero; caption the task it solves |
| Repeated feature narrative | Headline, club cards, offline section | Repeats paperwork/offline benefits without answering more objections | Organize around before, during, and after the trial |
| Pricing hidden in footer | “How Our Fees Work” | A decision-critical question is easy to miss | Add Fees in navigation and a short explanation near conversion |
| Company history occupies substantial early space | Trust section | Four historical products require extra interpretation | Keep concise RyKris credibility near the hero; put longer story lower |
| Future roadmap competes with current value | Hero and highlight strip | 2027 sports distract from launch scope | Put future sports in a clearly labeled FAQ or roadmap link |

**Visibility:** make current availability, supported launch sports, fees, and onboarding process visible. Reduce prominence of internal version numbers, architecture language, historical product taxonomy, and distant roadmap dates.

## Pass 3: Affordance Clarity

| Element | Looks like | Actually is | Clear? |
|---|---|---|---|
| Header waitlist button | Primary conversion | Moves visitors to waitlist | Yes, but conflicts with other conversion paths |
| Club feature card under pointer | Raised, outlined interactive card | Descriptive content in the observed accessibility tree | Potentially misleading; remove action-like hover treatment for static content |
| Footer “For exhibitors” | Jump to exhibitor content | Same #features destination as clubs | No; link to the exhibitor section |
| Name field | Similar requirement to email | Optional in local source | No; label “Name (optional)” |
| Ringside example | Real product evidence | Illustrative static view | Label clearly as example; use real capture for launch proof |

**False affordances:** static cards with strong hover elevation. **Hidden affordances:** no decisive finding beyond the footer anchor mismatch. Recommend consistent action styling and keeping readable links at adequate touch sizes.

## Pass 4: Cognitive Load

| Screen/step | Decisions required | Can be reduced? |
|---|---|---|
| Header + hero | Waitlist, shows, sign-in, three explanatory links; name/email/role | Two prominent outcomes: bring a club aboard or find a show; sign-in remains utility navigation |
| Current waitlist | Name, email, role | Respect the intentional lightweight form; explicitly mark name optional |
| Club request | Account creation/sign-in before seeing full request | Explain the steps and what happens afterward before asking for an account |

**Missing defaults:** no clear missing default; exhibitor is already selected. Do not add more waitlist targeting fields (intentional per source comment).

| Complexity | Who needs it | Recommendation |
|---|---|---|
| Replication terminology | Technical reviewers | Replace with outcome and preparation requirements |
| Historical product sequence | Returning RyKris users | Condense; retain useful continuity and migration guidance |
| All future capabilities | Roadmap readers | Separate available-at-launch from planned |

**Cognitive load: Medium.** Individual sections are understandable; cumulative repetition and competing conversion goals create hesitation.

## Pass 5: State Coverage

### Waitlist (local source review; submission not tested live)

| State | Implemented? | Quality | Issue |
|---|---|---|---|
| Empty | Yes | Partial | Name optionality is not labeled |
| Loading | Yes | Good basic coverage | Button changes to Joining and disables |
| Success | Yes | Partial | Club success says a sign-in link was sent based on role after insert, rather than verified email delivery |
| Partial/duplicate | Yes | Partial | Duplicate email returns generic success and does not provide invite recovery in the displayed copy |
| Error | Yes | Partial | Generic retry copy; no dedicated thrown-request recovery in the handler |
| Invalid email | Partial | Needs verification | Form uses noValidate and handler checks non-empty only; malformed email is not rejected by that client path |

### Club onboarding (local source review)

| State | Implemented? | Quality | Issue |
|---|---|---|---|
| Signed out | Yes | Good basic explanation | State the complete process before the sign-in gate |
| Loading | Yes | Good basic coverage | Existing request check has busy/loading text |
| Success | Yes | Good basic coverage | Submission explains review and expected response; do not repeat timing claims publicly without operating commitment |
| Existing request | Yes | Partial | Raw status vocabulary and limited next-step/support guidance |
| Error | Yes | Partial | Duplicate/auth-specific handling exists; an existing-request lookup failure logs and then permits a fresh form |

**Dead-end risks:** delayed/missing invitation email without a resend/support path; existing onboarding request without clear follow-up contact. These are source-based review observations, not experimentally reproduced delivery failures.

### Public show directory (live)

Observed loading resolves to four listings. Three have load-test names. No claim that filtering, registration, payments, or empty/error states were tested. Add an honest no-upcoming-events state if launch inventory is not ready; do not replace test names with invented customer events.

## Pass 6: Flow Integrity

**Primary flow inspected:** arrive as a prospective club or exhibitor, understand availability, locate a next step. Stopped before any live submission.

| Step | Action | Friction | Severity |
|---|---|---|---|
| 1 | Read hero | Clear domain, but conversion below large photo | Medium |
| 2 | Decide whether product is available | Waitlist and live onboarding conflict | High |
| 3 | Assess product fit | Numerous claims, limited real product evidence | Medium |
| 4 | Assess cost | Existing fee page accessible mainly from footer | Medium |
| 5a | Browse shows | Public load-test names undermine trust | High |
| 5b | Start club onboarding | Account required; request/review model should be stated earlier | Medium |

**Abandonment risks:** unclear launch state, test inventory, unproven broad claims, uncertainty about cost and adoption work. **Recovery:** no destructive actions inspected; live submission, email delivery, auth return, and payment recovery remain untested. **Flow verdict:** discovery is completable with friction; conversion end-to-end is unverified.

## Prioritized findings

**Overall UX health: Needs work for production conversion; good visual foundation.** No observed critical crash or data loss.

| Priority | Finding | Pass | Impact | Relative effort |
|---|---|---|---|---|
| High, before launch | Exclude test fixtures from public discovery | 1, 6 | Trust and event selection | Depends on existing publication model |
| High, before launch | Align availability and conversion paths | 1, 2 | Visitors know what they can do now | Small–medium |
| High, before launch | Validate/qualify offline and permanence claims | 1 | Sets accurate expectations | Copy small; evidence varies |
| Medium | Bring product proof and fees earlier | 2 | Reduces uncertainty | Small–medium |
| Medium | Improve waitlist validation/invite recovery if retained | 5 | Reduces silent or confusing failures | Medium |
| Medium | Explain account → request → review path | 4, 6 | Makes club adoption predictable | Small |
| Low | Fix exhibitor anchor, optional label, static-card hover | 3 | Reduces minor confusion | Small |

**Quick wins now:** label name optional; fix exhibitor anchor; make fees visible; clarify whether clubs get early access; shorten technical offline copy. Keep the waitlist until the corresponding production destinations are ready.

**Production content order:** concise hero + club/exhibitor actions → one-line RyKris credibility → real product walkthrough → before/during/after benefits → launch scope, fees, offline preparation and onboarding FAQs → repeat the same two actions → concise footer.

**Duplication question:** Does this duplicate an existing page? No new production page is proposed. Use existing /shows, /fees, sign-in, and club onboarding destinations. A marketing summary should link to those surfaces, not recreate their functionality. The separate prototype exists solely because the user requested visual exploration without app changes.

## Review artifacts and validation

Prototype: apps/myk9show/landing-prototype/ — standalone HTML/CSS with TypeScript interaction source, no connection to app services. Concept product data is explicitly illustrative, not actual usage or a current-app screenshot. Buttons explain intended existing destinations; FAQs and variant selection work locally. Fees reflect the live fee page observed on the review date.

TypeScript compiled with strict checking. Browser checks cover A/B/C rendering, variant switching, and intended stub behavior. Production app tests were not run because production code is untouched. Mobile CSS is provided, but the browser viewport override did not change the effective desktop width, so mobile visual validation is not claimed. No formal accessibility or performance audit was performed.

Before implementation: choose a concept; replace illustrative UI with approved real screenshots; validate launch claims and support arrangements; verify real event inventory and conversion destinations. Before shipping: test modified interactions and error states, keyboard/touch use, phone and desktop layouts, and end-to-end onboarding return paths in a non-production test environment.

OPSX is deferred: this is an advisory audit and throwaway visual exploration, with no product implementation, external tracking mutation, commit, PR, or deployment. No implementation phases are being marked complete.
