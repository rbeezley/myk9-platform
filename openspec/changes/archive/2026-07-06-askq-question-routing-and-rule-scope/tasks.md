# Tasks — AskQ Question Routing and Rule Scope

## 1. Shared Types and Request Contract

- [x] 1.1 Add shared TypeScript types for `AskQQuestionMode` and `AskQRulebookScope` near the existing AskQ request/asset types
- [x] 1.2 Extend the AskQ client service/hook request payload to send optional `questionMode` and `rulebookScope`
- [x] 1.3 Extend `AskQShowRequest` parsing in `ask-myk9show` to validate optional mode and rulebook scope without breaking existing callers
- [x] 1.4 Add service/hook tests proving omitted mode remains backward compatible and selected modes/scopes are sent correctly

## 2. Rulebook Scope Selection

- [x] 2.1 Add a small rulebook metadata helper that exposes available organization/sport options from bundled `ASKQ_RULEBOOKS`
- [x] 2.2 Reuse existing `normalizeSportCode` / `selectRulebook` behavior and add tests for AKC Scent Work, UKC Nosework, and ASCA Scent Detection scope normalization
- [x] 2.3 Update document-context selection so explicit rulebook scope is honored only when it is valid for the available rulebook set
- [x] 2.4 Preserve verified show-context scoping: when a verified show has rulebooks, explicit client scope may choose only among that show's rulebooks
- [x] 2.5 Add edge-function tests for ambiguous rules questions outside show context, explicit AKC/UKC scope, unknown scope, and scope conflicting with verified show context

## 3. Mode-Aware Server Routing

- [x] 3.1 Update the AskQ system prompt builder to include the selected mode and narrow grounding/tool rules for App help, Rules, and This show
- [x] 3.2 In Rules mode, return/stream a clarification response when no single rulebook scope is available instead of passing ambiguous rulebooks to the model
- [x] 3.3 In This show mode, keep live-data questions on show-data tools and avoid answering them from user-guide or rulebook context
- [x] 3.4 In App help mode, keep existing support/user-guide evidence gates and avoid enabling live-data tools unless explicitly outside support mode
- [x] 3.5 Add edge-function tests covering mode constraints and source-label behavior for rules answers

## 4. AskQ Panel UI

- [x] 4.1 Replace the current two-state AskQ/app-help internal mode with a user-facing segmented control for App help, Rules, and This show inside the existing `AskQPanel`
- [x] 4.2 Default the selected mode from route context: app-help launcher to App help, show routes to This show, rule examples to Rules
- [x] 4.3 In Rules mode, show compact organization/sport selectors populated from bundled rulebook metadata and prefilled from verified show/trial context when available
- [x] 4.4 Disable or clarify This show mode when no show context exists rather than guessing a show
- [x] 4.5 Keep all controls within the existing panel; do not add a new page, drawer, or standalone rulebook browser

## 5. Mode-Aware Examples and UX Copy

- [x] 5.1 Split AskQ examples by App help, Rules, and This show categories
- [x] 5.2 Ensure Rules examples include organization/sport when not launched from verified show context, or trigger the rulebook selector before submission
- [x] 5.3 Ensure rules answers display a concise rulebook label such as "Using AKC Scent Work rules"
- [x] 5.4 Review visible copy against `docs/INTENT.md`: calm, plain English, no technical explanation wall

## 6. Testing and Verification

- [x] 6.1 Add component tests for mode selection, example filtering, rulebook selectors, and no-show-context behavior using `src/test/utils/testUtils.tsx`
- [x] 6.2 Add hook/service tests for request payload mode/scope and backward compatibility
- [x] 6.3 Add document-context/helper tests for rulebook normalization, selection, and show-context precedence
- [x] 6.4 Add edge-function tests for ambiguous rules, explicit scoped rules, invalid scope, show-data mode, and app-help mode
- [x] 6.5 Run the focused AskQ/support test set: `pnpm exec vitest run ../../supabase/functions/_shared/askq/*.test.ts src/test/services/askqService.test.ts src/test/hooks/useAskQ.test.ts src/test/components/askq/AskQAnswer.test.tsx src/test/components/askq/AskQExampleQueries.test.tsx`
- [x] 6.6 Run `pnpm typecheck` and `pnpm lint`

## 7. Review, Tracking, and Shipping

- [x] 7.1 Update relevant tracking docs or go-live support notes if the completed implementation changes AskQ launch-readiness posture — tracked in this OpenSpec change; no separate launch-readiness doc update needed
- [x] 7.2 Run a subagent code review focused on grounding safety, rulebook ambiguity, and UX simplicity
- [x] 7.3 Fix review findings and rerun focused tests
- [x] 7.4 Open or update the PR with the test plan and screenshots if UI changed materially
- [x] 7.5 Merge only after required CI passes and OpenSpec verification is complete
