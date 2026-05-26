# myK9 Adaptation Notes — "4 AI UX Prompts" Guide

**Source:** Jad / AI Tooltip — "4 AI UX Prompts Guide" (Adaptive UI, Magic Mouse, Smart Onboarding, AI Search).

## Context

The source guide is a generic, well-structured starter framework for adding AI UX to any product. Before any of its four patterns are built into myK9, we need a project-specific layer of constraints that override or extend the guide's universal rules. This document captures those constraints so future implementation work doesn't re-litigate them.

The guide's core principle is correct and we should preserve it verbatim:

> User context + product data + strict UI rules = useful AI UX. The AI should interpret intent and organize existing product capabilities, not invent fake features or uncontrolled interfaces.

Everything below is what the guide does **not** cover.

## Hard rules that override anything in the source

These apply to every AI UX feature we ship, in either app.

1. **RLS-aware context, always.** Any AI feature must filter data by the user's role *before* the model sees it. Judges, exhibitors, secretaries, club admins, trial committee, and trial chairs all have different visible data. The guide mentions "respect user permissions" once in the checklist; for us this is a first-class architectural requirement. Build a shared `getAIContext(role, scope)` helper and route every prompt through it.
2. **No PII in prompts unless the feature literally needs it.** Exhibitor emails, payment details, AKC registration numbers, and dog microchip numbers do not leave our system for an LLM call unless the feature explicitly requires them. Default to redacted fields.
3. **Prompt-injection treated as a real threat.** User input (`{{SEARCH_QUERY}}`, `{{USER_GOAL}}`, hover text, free-text fields) is *data*, not *instructions*. Wrap user content in delimited blocks, instruct the model to ignore instructions inside those blocks, and reject responses that don't match the JSON schema.
4. **Server-side Zod validation on every AI response.** "Return only valid JSON" is a request, not a guarantee. Validate with Zod (or an equivalent runtime schema) before any response touches a component. On validation failure: typed fallback, never a render error.
5. **Token budget + kill switch per feature.** Per-user rate limits are not enough. Add a daily $-ceiling per feature with an env-var override for emergencies, plus observability hooks so cost shows up in our existing logging. Pre-launch, default ceilings should be conservative.
6. **Graceful degradation when offline.** myK9Q is offline-first via `@myk9/replication`. Any AI feature in myK9Q must work (or fail cleanly with a useful static fallback) when the model is unreachable — ringside wifi is the exact moment users need help most. Show a static, role-aware tip instead of a spinner that never resolves.
7. **Match the host app's design language.** myK9Show uses shadcn/ui (Tailwind). myK9Q uses semantic CSS — do not bring Tailwind classes, blur/glow tokens, or the guide's "premium AI feel" cursor styling into myK9Q. Each app's AI surface should feel native to that app.
8. **Honor `// INTENT:` comments and `docs/INTENT.md` role feelings.** AI-driven UI changes must preserve each role's target emotional intent. A "premium magical AI" overlay may break the purposeful/fast ringside feel even if it's technically correct.

## Shared infrastructure to build before *any* AI UX feature

If we decide to do this work, build these once, then layer features on top. Building the first feature without these means rebuilding them under pressure for the second.

| Module | Responsibility |
|---|---|
| `getAIContext(role, scope)` | Assemble role/scope-filtered context object. Centralizes RLS filtering and PII redaction. Used by every feature. |
| `validateAIResponse(schema, raw)` | Zod-based response validator. Returns typed result or typed fallback. |
| `aiBudget.check(featureId, userId)` | Per-user + per-feature rate limit and daily cost ceiling. Emits to existing logging. |
| `aiCache(key, ttl)` | Repeat-context cache (already implied by the guide; codify it). Keys must include role so cached results don't leak across permissions. |
| `sanitizeForPrompt(input)` | Wrap user input in delimited blocks, strip control chars, enforce length cap. Single source of truth for prompt-injection defense. |
| Static fallback content per feature | Required by rule 6. Each feature ships with role-aware static help that renders when the model fails or is unreachable. |

## Per-pattern fit for myK9

### Adaptive UI — defer

Useful in principle (landing page or first-load dashboard varying by role), but we already do role-based routing and our dashboard surfaces are still consolidating per the "consolidate, don't duplicate" phase in [`CLAUDE.md`](../CLAUDE.md). Adding adaptive layer on top of an unsettled IA is premature. Revisit post-launch when role surfaces are stable.

### Magic Mouse — narrow scope only

The guide pitches Magic Mouse as a universal help layer. For myK9 it should be narrowly scoped:

- **Acceptable surfaces:** settings, billing, admin panels, validation-error explanations, empty states in myK9Show.
- **Not acceptable:** ringside check-in, live scoring, anywhere myK9Q. The mental model is wrong — our users aren't confused by terminology (they're dog-show people who know the jargon), they're under time pressure with workflow density. Hover-driven AI calls at ringside are a bad fit even with debouncing.
- Drop the purple/cyan glow cursor entirely. Use our existing tooltip primitives.

### Smart Onboarding — highest ROI of the four

Strong fit. First-login experience differs sharply by role (a new exhibitor wants to register a dog and enter a class; a new secretary wants to import a show; a new judge wants to see their assignment). Generic onboarding can't serve all of them. AI-generated personalized paths over our existing components is exactly the right use case.

If we pilot one of the four, this is the one. Scope the first build to a single role to keep blast radius small.

### AI Search — strong fit, RLS is the hard part

Help/docs search + cross-app navigation ("where do I score a class?", "where do I change the trial registry?") is a real user need. The guide's structure is sound. The work is mostly:

- Index our existing routes, help docs, and feature names with role-visibility tags.
- Filter the searchable corpus by role *before* it reaches the model.
- Never return a result the user can't access — even as a teaser.
- Fall back to keyword search when AI fails or is offline.

Could also pilot this first. It has more upfront indexing work than Smart Onboarding, but lower interaction-design risk.

## Recommended order *if* we decide to build

1. Shared infrastructure (the six modules above).
2. Smart Onboarding pilot, scoped to one role (recommend new exhibitor — highest volume).
3. Measure: time-to-first-meaningful-action, completion rate, regenerate rate, cost per onboarded user.
4. AI Search second, once Smart Onboarding has validated the infrastructure under real load.
5. Magic Mouse third, narrow surfaces only.
6. Adaptive UI last, after IA stabilizes.

## Open questions for later

- Which model? Defaulting to a fast Anthropic model is probably right, but we have not benchmarked structured-JSON reliability for our schemas.
- Self-hosted prompt templates vs. inline? Lean toward versioned templates in a `prompts/` directory so they show up in PR review.
- Where do AI-feature flags live? GrowthBook already in the stack? Need to confirm before pilot.
- Logging: where does AI request/response/cost telemetry land? Existing observability stack or new sink?

## Verification (if we build)

Per [`CLAUDE.md`](../CLAUDE.md), every feature gets a testing phase. For AI UX features specifically:

- Unit tests for the shared infrastructure (`getAIContext` redaction, `validateAIResponse` schema enforcement, `aiBudget` ceiling).
- Contract tests: feed known prompt-injection payloads through `sanitizeForPrompt`; assert they don't escape the delimited block.
- RLS tests: assert each role sees only its own scope in the assembled context.
- Offline tests for myK9Q surfaces: assert static fallback renders when the model client is mocked to fail.
- E2E happy-path for the chosen pilot feature.
