## Context

AskQ currently has one visible panel with two internal modes: normal AskQ and app-help support mode. The server prompt already recognizes three conceptual question types:

- rules questions answered from selected rulebook context
- show-data questions answered with live tools
- app-help questions answered from verified user guides

The recent grounding fixes made those paths safer, but the user still has no simple way to say which path they intend. Rules are especially sensitive because the same wording can be valid under multiple organizations or sports. For example, "Excellent Containers max time" needs a specific rulebook: AKC Scent Work and UKC Nosework must not be treated as interchangeable.

This design keeps AskQ as the single front door and adds explicit intent where it reduces ambiguity. It should feel calm and clarifying, not like a setup wizard.

## Goals / Non-Goals

**Goals:**

- Let users choose the kind of question they are asking inside the existing AskQ panel.
- Preserve auto-detection for users who just type a question.
- Make rules answers require a specific rulebook scope when the organization/sport cannot be safely inferred.
- Prefill question mode and rulebook scope from verified route/show/trial context when available.
- Keep show-data questions using show-scoped tools and existing auth/rate-limit behavior.
- Keep app-help questions grounded in verified guide context and current support-mode safety gates.

**Non-Goals:**

- No standalone rulebook browser.
- No rulebook upload/admin management surface.
- No new support ticket workflow.
- No vector database or broad retrieval architecture.
- No new show-data tools unless focused tests prove an existing database question cannot be answered.
- No duplication of existing show, entry, result, or support surfaces.

## Decisions

**1. Add a lightweight AskQ mode selector, not a required step.**

Use a compact segmented control/tabs inside `AskQPanel` with three user-facing choices: **App help**, **Rules**, and **This show**. The control updates the request payload and examples. If the user does not touch it, AskQ keeps auto-detection as fallback.

Alternative considered: require the user to choose before typing. Rejected because it adds friction and makes the assistant feel less helpful for simple questions.

**2. Preserve one AskQ panel.**

This change modifies `AskQPanel`, `useAskQ`, AskQ examples, and `ask-myk9show`; it does not add a new page, drawer, or route. A link is not enough because the defect is not navigation. The defect is ambiguous grounding inside the assistant pipeline.

**3. Treat question mode as routing metadata, not trusted authority.**

The client sends an optional `questionMode` such as `app-help`, `rules`, or `show-data`. The edge function uses it to narrow allowed context/tools:

- `app-help`: user-guide context only, support-mode answer gates where applicable, no live data tools.
- `rules`: rulebook context only, no live data tools, no user-guide answers.
- `show-data`: show-data tools only, no rulebook/user-guide answer if live data is needed.

The server still validates `showId`, rate limits the request, checks ownership/RBAC as it does today, and refuses impossible combinations.

**4. Represent rulebook scope explicitly.**

Extend the AskQ request with optional `rulebookScope`:

```ts
type AskQQuestionMode = 'app-help' | 'rules' | 'show-data';

interface AskQRulebookScope {
  organizationCode?: string;
  sportCode?: string;
}
```

The server selects a rulebook by validated scope using bundled `ASKQ_RULEBOOKS` metadata. Unknown organization/sport values produce a clarifying response or a validation error, not a guessed answer.

**5. Show context can prefill, but explicit user choice wins only within safe bounds.**

If the user is in a verified show/trial context, the server derives available rulebook scopes from that show's trials. The client may preselect the matching organization/sport. When verified show context exists, the available rulebooks remain limited to the show's trials. Outside verified show context, explicit user selection may choose from all bundled rulebooks.

Alternative considered: always load all rulebooks and ask the model to decide. Rejected because it creates avoidable ambiguity and token pressure.

**6. Ambiguous rules questions ask for scope.**

If the user chooses Rules mode or the classifier detects a rules question but no single rulebook scope can be selected, AskQ asks which rulebook to use. It should offer available concrete choices, for example "AKC Scent Work" and "UKC Nosework", when those rulebooks exist.

**7. Rules answers identify their source.**

Every rules answer includes a short source label, such as "Using AKC Scent Work rules". This keeps the answer understandable when users screenshot or repeat it later.

**8. Keep show-day reliability and offline boundaries intact.**

This change affects AskQ, which is online and already calls an edge function. It must not bypass existing replicated/offline-first flows for core show-day operations. Show-data questions keep using the established tool executor and server-side Supabase access; no client direct reads are introduced.

## Risks / Trade-offs

- **Mode selector adds UI surface** -> Keep it compact, inside the existing panel, with route-based defaults and no explanatory wall of text.
- **User chooses wrong mode** -> Allow auto-detection fallback where safe, and provide clear clarification when the selected mode cannot answer.
- **Rulebook metadata drifts from trial data** -> Use existing `registry_id` and `trial_type` normalization, add tests for known AKC/UKC/ASCA mappings, and fail closed when no rulebook matches.
- **Too many rulebooks later** -> Start with simple selectors and grouped options. Do not build search/admin tooling until the rulebook set proves it needs it.
- **Ambiguous show context** -> Server remains the source of truth. Client defaults are hints only.

## Migration Plan

1. Add shared types for question mode and rulebook scope.
2. Extend the client request path and edge-function request parsing.
3. Add UI mode selector and rulebook scope selector in the existing AskQ panel.
4. Add server selection/clarification behavior.
5. Add tests at helper, service/hook, component, and edge-function levels.
6. Deploy normally; no database migration is expected.

Rollback is simple: hide the selector and stop sending the optional fields. Server should continue accepting omitted mode/scope and use current auto-detection behavior.

## Open Questions

- Should Rules mode be available to all roles from every route, or only where AskQ is already visible?
- Do we want to expose "sport" labels exactly as registry language uses them, or normalize user-facing labels to a myK9 vocabulary?
- Should "This show" mode be hidden when there is no show context, or visible with a clear prompt to choose/open a show?
