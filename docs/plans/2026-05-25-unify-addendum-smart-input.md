# Addendum to Unification Plan — Smart-Input Replaces Two-Door Landing

> **Parent plan:** [2026-05-17-unify-myk9show-myk9q.md](2026-05-17-unify-myk9show-myk9q.md)
> **Date:** 2026-05-25
> **Status:** Proposed revision to Locked Decision #2

## Context

The parent plan's Locked Decision #2 specifies a two-door landing on `myk9show.com`:

> **Two doors, one room.** myk9show.com's landing offers equal-weight options:
> - **Sign in** (account holders)
> - **Use show passcode** (volunteer stewards, judges, non-account exhibitors)

In design review, the two-door pattern was identified as load-bearing for the older volunteer/judge persona — done well it's fine, done poorly it forces a confusing choice ("why is this asking me to sign in? I don't have an account") on the persona least equipped to absorb cognitive overhead. The two doors solve a problem (telling both audiences they belong here) by introducing a different problem (forcing a choice point at the entry).

A single-input alternative is viable because the two credential shapes are visually unambiguous and reliably distinguishable client-side as the user types.

## Revised Locked Decision #2

**One smart input, not two doors.** The myk9show.com landing has a single credential field that accepts either an account email or a show passcode. The form disambiguates client-side as the user types and routes them through the correct flow without requiring an upfront choice.

## Credential disambiguation

| Input shape | Detection | Flow |
|---|---|---|
| Contains `@` | Email | Step 2 reveals password field → Supabase Auth sign-in |
| Exactly 5 chars, first is `a`/`j`/`s`/`e`, rest alphanumeric | Passcode | Submit immediately → passcode session, route by role |
| Anything else | Invalid | Friendly error with format hint and example |

The two shapes have zero overlap, so detection is deterministic.

## Required UX affordances

1. **Live disambiguation copy under the input.** As the user types, surface what the form sees:
   - `> Looks like an email — we'll ask for your password next`
   - `> Looks like a show passcode — you'll be signed in`
   - This makes smart detection visible (not magic), and *teaches* first-time passcode users that passcodes are a thing.

2. **Discoverability copy below the input.** A static explanation that both audiences exist:
   > Have an account? Use your email.
   > Working a show? Use the passcode your secretary gave you (5 characters).

3. **A "Learn how it works" link** for first-time users who don't know what either credential is.

4. **No "Forgot password?" link on step 1.** Only appears on step 2 of the email branch. Passcode users have nothing to recover; the link is contextually wrong for half the audience pre-disambiguation.

5. **Aggressive trim on submit.** Strip leading/trailing whitespace — passcodes get typed in parking lots on phones.

6. **Mobile keyboard hint.** Default `inputmode="email"` (gives `@` and `.` keys); the form re-evaluates as the user types so passcode entry isn't blocked by the wrong keyboard layout.

7. **Error state for unrecognized input.** When the user submits something that's neither shape:
   > That doesn't look like an email or a show passcode. Passcodes are 5 characters and start with a letter — for example, `aa260`.

## Post-credential routing (unchanged by this addendum)

Whichever credential type is used, the post-auth destination must be unambiguous. No intermediate "now pick your role" step:
- Passcode `j****` → judge UI
- Passcode `s****` → steward UI
- Passcode `e****` → ringside (manual favoriting)
- Email sign-in + entries in a show today → "Show today" banner → `/at-show` with auto-favorited dogs
- Email sign-in + no entries today → account home

## Pros over the two-door pattern

- No choice point — eliminates the cognitive load the two-door design imposes on the older volunteer/judge persona
- Familiar pattern — every web user has used an input field
- Better accessibility — single input is simpler in focus order than two equal-weight CTAs
- Secretary handoff is one sentence: "Go to myk9show.com and type this." No "tap the passcode button first."
- No risk of Sign In visually dominating the passcode path — they share the same field

## Cons / mitigations

| Concern | Mitigation |
|---|---|
| First-timer discoverability — does a new judge know passcodes exist? | Static explanation copy below the input + "Learn how it works" link |
| Account-holder two-step latency (email → password) | One re-render; pattern is familiar (Slack, Google, Apple); accept |
| Unrecognized input error states | Friendly error copy with format example (see above) |
| Mobile keyboard friction | Smart `inputmode` switching as the user types |

## Phase impact

This addendum changes **Phase 1, step 2** of the parent plan:

> Add homepage two-door landing: equal-weight "Sign in" and "Use show passcode" CTAs.

Replaced with:

> Add homepage smart-input landing: single credential field that auto-routes between email sign-in (two-step) and passcode session, with live disambiguation copy and discoverability text. Unit tests for shape detection (email vs passcode vs invalid). Playwright spec exercising all three input shapes including the unrecognized-input error path.

All other phases unchanged.

## Out of scope for this addendum

- Visual design / brand styling of the input (separate design pass)
- Localization of disambiguation copy
- Magic-link or SSO sign-in options (could layer onto the email branch later)
- Biometric / WebAuthn (different conversation)

## Open question

Should the input also accept the **legacy `myk9q.com` passcode format** if it differs from the monorepo format? Worth confirming the formats are identical before Phase 1 design so we don't ship a smart input that rejects passcodes some long-time users still have on cards in their wallet.
