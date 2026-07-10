## Why

The avatar menu currently presents account, billing, appearance, AskQ, support, and connection state as a mostly flat list, while AskQ uses a generic message icon that is easy to mistake for ordinary messaging. Consolidating these choices and giving AskQ a recognizable Q-in-a-bubble mark makes the shared shell calmer and easier to scan for exhibitors, supporting fall 2026 launch readiness through lower navigation friction.

Original requests, verbatim:

> "what do you think of the icon for AksQ? Should it be something with a question mark. Any thoughts of the avatar menu organization?"
>
> "can you implment these suggestions"
>
> "can we use the opsx:ship skill"

## What Changes

- Replace the generic AskQ message icon with a reusable speech-bubble icon containing a `Q`, while preserving the existing icon-only header button's accessible name.
- Shorten the avatar-menu label to `AskQ` and group it beside the existing Help & Guides action.
- Consolidate Subscription and Pricing into one contextual destination: `Plan & billing` for premium users and `View plans` for free users.
- Replace separate Online and Synced labels with one calm, truthful save-status message derived from the existing network and global sync hooks.
- Shorten the theme action to `Light mode` or `Dark mode` and group it with About.
- Keep Sign out visually neutral until hover or focus.
- Preserve the current responsive behavior: AskQ remains a desktop header action and a labeled avatar-menu action at compact widths.

This change does not duplicate an existing surface. It reuses the existing AskQ panel, help URL, subscription page, pricing page, theme handler, status hooks, and account dropdown. A link alone is not enough because the problem is the organization and recognition of existing shell actions, not the absence of a destination.

Non-goals:

- No new page, drawer, dialog, route, assistant behavior, billing flow, or appearance settings surface.
- No changes to AskQ question routing, subscription entitlement rules, replication, or offline persistence.
- No broader header or navigation redesign.

## Capabilities

### New Capabilities

<!-- None. This change tightens the existing application-shell contract. -->

### Modified Capabilities

- `shell-interaction-integrity`: Define recognizable AskQ access, task-oriented account-menu grouping, contextual plan navigation, calm truthful save status, concise appearance copy, and neutral sign-out emphasis.

## Impact

- **Affected UI:** `apps/myk9show/src/components/layout/AccountMenuContent.tsx`, `AppHeader.tsx`, and a small shared AskQ icon component.
- **Affected tests:** focused account-menu and header component tests.
- **APIs/data:** no API, schema, dependency, replication, or shared-system changes.
- **Accessibility:** the header AskQ button retains `AskQ Assistant` as its accessible name; labeled menu actions remain available on compact layouts.
