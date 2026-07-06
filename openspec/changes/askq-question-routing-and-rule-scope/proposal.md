## Why

AskQ now answers three different kinds of questions: app-help questions from verified guides, rules questions from bundled rulebooks, and live show-data questions from tools. Keeping those paths implicit makes ambiguous prompts fragile, especially rules questions where the same words can mean different things under AKC, UKC, ASCA, or future rulebooks.

This supports fall 2026 launch readiness by making AskQ calmer and more reliable for exhibitors and secretaries before it becomes a visible support surface during real trial operations.

## What Changes

- Add an AskQ question-mode selector inside the existing AskQ panel for:
  - **App help**: questions about using myK9Show, grounded only in verified user guides.
  - **Rules**: official rule questions, grounded only in an explicit rulebook scope.
  - **This show**: live show-data questions, answered through show-scoped tools.
- Keep auto-detection as a fallback when users do not choose a mode, but let the selected mode override ambiguous routing.
- Add rulebook scope selection for Rules mode:
  - Organization / registry, such as AKC, UKC, ASCA.
  - Sport / rulebook, such as AKC Scent Work, UKC Nosework, ASCA Scent Detection.
  - Prefill from the current show/trial when verified context exists.
- Require clarification before answering rules questions when the rulebook scope is ambiguous.
- Include the rulebook label in every rules answer so users know which source was used.
- Preserve existing show-scoped behavior: verified show context limits rulebooks to that show's trials; no verified show context can use the user's explicit rulebook selection.
- Update AskQ examples so each mode shows examples that match its grounding source.

## Capabilities

### New Capabilities

- `askq-question-mode-routing`: Covers the AskQ mode selector, mode-aware examples, request payload mode, server-side routing constraints, and fallback auto-detection behavior.
- `askq-rulebook-scope-selection`: Covers explicit rulebook scope selection, show/trial-derived defaults, clarification behavior for ambiguous rule questions, and rulebook source labels in answers.

### Modified Capabilities

<!-- None. No archived root spec currently owns AskQ behavior; this proposal introduces the AskQ-specific contracts. -->

## Impact

- **Affected UI:** existing `AskQPanel`, examples, input state, and any shared AskQ service/hook types. This does not create a new page, sheet, or separate assistant surface.
- **Affected API:** `ask-myk9show` request contract likely gains optional mode and rulebook scope fields. Server logic must validate those fields and avoid trusting client context blindly.
- **Affected document context:** bundled rulebook selection should support explicit organization/sport scope, verified show/trial defaults, and source labels.
- **Affected tests:** component tests for mode selection and examples; hook/service tests for request payloads; edge-function tests for routing, clarification, rulebook selection, and show-context precedence.
- **Duplication check:** this tightens the existing AskQ panel rather than duplicating support, rules, or show-data surfaces. A link alone is not enough because the problem is routing and grounding inside the assistant response path, not navigation to another workflow.
- **Non-goals:** no new standalone rulebook browser, no new support ticket workflow, no broad retrieval/vector database, no rulebook upload/admin surface, no new live-data tools unless a test proves an existing database-question path is missing.
