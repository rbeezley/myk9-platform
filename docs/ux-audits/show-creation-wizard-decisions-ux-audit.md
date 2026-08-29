# UX Audit: Show Creation Wizard Product Decisions

**Date:** 2026-08-29
**Auditor:** Codex
**Sources:** MYK9-255, `docs/INTENT.md`, wizard and club-management source, role-gate tests, club RLS migrations, and publish-control source
**Scope:** The three gated decisions in MYK9-255, not a new whole-page sweep

## Pass 1: Mental Model Alignment

**What UI suggests:** The wizard gathers everything needed to create a complete show, and its final actions represent three meaningfully different outcomes.

**What it actually does:** Inline club creation produces an incomplete club; “Save as Draft” and “Create Show (Unpublished)” both create a draft show; and publishing is available both in the wizard and from the show status control.

**Misalignment gaps:**

| UI Element                                | User Expects                     | Actually Does                                                                                                    | Severity |
| ----------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| Create New Club                           | Create a usable host-club record | Captures only name and email, leaving the premium address blank                                                  | High     |
| Save as Draft / Create Show (Unpublished) | Two distinct outcomes            | Both persist a show with draft status, with different follow-up handling                                         | High     |
| Create & Publish Show                     | One authoritative publish action | Duplicates the show status control's money-path gate                                                             | High     |
| Show Details                              | Basic show identity              | Contains identity, dates, money, optional settings, and people, but separates them with visible section headings | Medium   |

**Jargon found:** “Unpublished” and “Draft” describe the same stored state and should not appear as separate choices.

## Pass 2: Information Architecture

**Current structure:**

- Show Details: Basics, Dates & Entry, Fees & Payments, More Options, Officials
- Trials: trial configuration
- Classes: class selection and judge assignment
- Review: validation, summary, draft creation, unpublished creation, and publish
- Clubs: the full club-management surface, but its UI currently exposes creation only to site admins
- Show detail: the status control owns draft-to-published transitions

**IA issues:**

| Issue                       | Location             | Problem                                                                              | Recommendation                                                                                     |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Duplicate entity creation   | Wizard / Clubs       | The wizard creates a partial club while `/clubs` owns the complete record            | Make `/clubs` the sole creation surface; deep-link there and return with the created club selected |
| Duplicate publish ownership | Wizard / Show detail | Two surfaces own the same payment-account gate                                       | Create the show as a draft, then publish only from the show status control                         |
| Apparent step imbalance     | Show Details         | One step is longer, but its internal groups match the secretary's setup mental model | Keep the four steps; do not create another multi-step form without observed abandonment evidence   |

**Visibility problems:**

- Hidden but should be visible: the inline club's missing address and the fact that both non-publish buttons create a draft.
- Prominent but should be secondary: publishing before the secretary reaches the persistent show-management surface.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element                   | Looks Like                    | Actually Is                                                        | Clear? |
| ------------------------- | ----------------------------- | ------------------------------------------------------------------ | ------ |
| Create New Club           | Complete club-creation action | Minimal two-field insert                                           | No     |
| Save as Draft             | Safe persisted draft          | Creates a real show and navigates to it                            | Partly |
| Create Show (Unpublished) | Separate creation mode        | Creates the same draft status                                      | No     |
| Create & Publish Show     | Final happy-path action       | A second implementation of the status control's publish transition | Partly |
| Show status pill          | Status badge with menu        | The intended publish transition control                            | Partly |

**False affordances:** “Create Show (Unpublished)” implies a distinct state from “Save as Draft.”

**Hidden affordances:** The show status pill is interactive, but only after the show exists.

**Recommended fixes:**

- Use one wizard completion action: “Create Show.”
- Land the secretary on the created show's management surface with the draft status control visible.
- Replace inline club creation with a link that preserves and restores the wizard draft.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step  | Decisions Required                                                       | Can Be Reduced?                                                                           |
| ------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Show Details | Identity, dates, fees, payment methods, officials, and optional settings | Keep grouped sections; cloning, defaults, and auto-selected secretary already reduce load |
| Review       | Fix errors, save draft, create unpublished, or create and publish        | Reduce three final actions to one “Create Show” action                                    |
| Show detail  | Review readiness and publish                                             | Keep this as the single publish decision point                                            |

**Missing defaults:** None directly caused by these three decisions. The logged-in secretary and sole club already auto-select where possible.

**Unnecessary complexity:**

| Complexity                                                    | Who Needs It                                     | Recommendation                          |
| ------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| Choosing between two draft-creation labels                    | Nobody                                           | Delete the duplicate action             |
| Choosing whether to publish before seeing the persistent show | Secretaries can decide later with better context | Move publish to the show status control |
| A fifth Officials step                                        | No demonstrated need                             | Do not add it                           |

**Cognitive load score:** Medium — the grouped data entry is long but coherent; the avoidable load is concentrated in the three final actions.

## Pass 5: State Coverage

### Host Club

| State   | Implemented? | Quality | Issue                                                                                          |
| ------- | ------------ | ------- | ---------------------------------------------------------------------------------------------- |
| Empty   | Yes          | Poor    | “No clubs found” still offers a partial inline record rather than the complete management flow |
| Loading | Yes          | Good    | Existing club loading is handled through the store                                             |
| Success | Yes          | Poor    | The new club is selected even though address data is absent                                    |
| Partial | Yes          | Poor    | Partial is treated as complete and Review does not disclose the missing address                |
| Error   | Yes          | Poor    | Generic “Failed to save” hides permission or identity errors                                   |

### Publish

| State                   | Implemented? | Quality    | Issue                                                                                                                         |
| ----------------------- | ------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Empty club              | Yes          | Good       | Both gates fail closed                                                                                                        |
| Loading payment account | Yes          | Good       | The secretary is asked to retry shortly                                                                                       |
| Success                 | Yes          | Duplicated | Wizard and status control each own the transition                                                                             |
| Partial                 | Yes          | Poor       | The show-management shells omit `clubId` when rendering `ShowStatusPill`, so that control always fails closed for draft shows |
| Error                   | Yes          | Good       | Payment lookup and disconnected-account states are distinguished                                                              |

**Dead ends found:** Linking a secretary directly to `/clubs` today would be a dead end because the page hides “New Club” from secretaries despite migration 160 permitting secretary and club-admin inserts.

**Missing error handling:** A linked club flow needs a return route and created-club selection; otherwise draft persistence prevents data loss but still makes the secretary hunt their way back.

## Pass 6: Flow Integrity

**Primary flow tested:** Create a show when the host club does not yet exist, then publish it.

**Step-by-step findings:**

| Step | Action                       | Friction                                                                                              | Severity |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| 1    | Enter show details           | One long step, but internally grouped and supported by defaults                                       | Medium   |
| 2    | Create missing club inline   | Incomplete club record creates blank downstream address                                               | High     |
| 3    | Configure trials and classes | No issue introduced by these decisions                                                                | None     |
| 4    | Review                       | Three overlapping final actions force an unnecessary state choice                                     | High     |
| 5    | Publish                      | The wizard duplicates the payment gate; the later status control is currently missing `clubId` wiring | High     |

**Abandonment risks:**

- A linked club flow without secretary access and an automatic return path.
- A publish control that refuses every draft because its management-shell caller omits `clubId`.
- Adding another wizard step when the current grouped step is already completable.

**Recovery gaps:**

- Missing back/undo: Club creation does not have a wizard-aware return route.
- No cancel option: Not applicable; both the wizard and club panel have exits.
- Destructive with no confirm: Not part of these decisions.

**Flow verdict:** Completable with friction. The current inline club path completes the wizard but creates dishonest downstream data; the consolidated path requires role-gate, return-path, and status-control wiring before inline creation can be removed.

---

## Summary

**Overall UX health:** Needs Work

### Critical (Fix immediately)

None in this decision scope.

### High Priority (Fix soon)

| Finding                                                          | Pass    | Impact                                                       | Effort |
| ---------------------------------------------------------------- | ------- | ------------------------------------------------------------ | ------ |
| Inline club creation persists an incomplete host club            | 1, 5, 6 | Blank club address in Review/premium                         | Medium |
| Review presents two draft outcomes plus a duplicate publish path | 1, 3, 4 | Confusing final decision and duplicated money gate           | Medium |
| Show-management status controls omit `clubId`                    | 5, 6    | Draft shows cannot publish from the intended central surface | Low    |

### Medium Priority (Plan for)

| Finding              | Pass | Impact                         | Effort             |
| -------------------- | ---- | ------------------------------ | ------------------ |
| Show Details is long | 2, 4 | Scrolling and perceived effort | High if re-stepped |

### Low Priority (Nice to have)

None in this decision scope.

### Quick Wins (High impact, low effort)

- Pass `show.clubId` to both management-shell instances of `ShowStatusPill`.
- Collapse the two draft-result buttons into one “Create Show” action.

### Recommendations

1. **Club creation:** Link to the complete `/clubs` creation surface, but only as an end-to-end consolidation: align the page gate with existing RLS for secretaries and club admins, preserve a safe `returnTo`, and select the created club when the wizard resumes. Then delete the inline two-field creator.
2. **Publishing:** Always create a draft in the wizard. Remove publish-from-wizard and make `ShowStatusPill` the sole show-status transition surface after wiring `clubId` in both management shells.
3. **Step split:** Leave the four-step split unchanged. The current internal sections are coherent, and adding an Officials step conflicts with the secretary intent to avoid multi-step forms. Revisit only with observed usability evidence.

## Duplication Decision

Yes, inline club creation and wizard publishing duplicate existing surfaces. Neither duplication remains justified after draft persistence. Consolidation is justified only if the destination surfaces are made reachable and complete for secretaries; removing the inline paths before that would replace duplication with dead ends.
