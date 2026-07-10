## Context

`AccountMenuContent` currently owns identity, online/sync status, account and billing links, theme and AskQ actions, role-specific links, developer tools, help, About, and Sign out. `AppHeader` separately exposes the same theme and AskQ handlers at desktop widths and relies on the avatar-menu entries at compact widths. The structure is already consolidated onto canonical surfaces, but its flat ordering and generic `MessageSquare` icon do not clearly communicate task groups or the AskQ identity.

The change must preserve the exhibitor intent of “This respects my time” and the platform qualities of calm, simple, and respectful. It must also preserve the existing responsive rule that avoids crowding phone headers.

The relevant existing units are:

- `AccountMenuContent.tsx` for menu ordering and actions.
- `AppHeader.tsx` for the icon-only desktop AskQ trigger.
- `useAskQPanelStore` for the existing assistant panel toggle.
- `useSubscriptionGate` for the effective premium state, including paid, early-adopter, and trial access.
- `useNetworkStatus` and `useGlobalSyncStatus` for real connectivity and replication status.
- `/subscription`, `/pricing-page`, `helpUrl()`, and the existing About callback for canonical destinations.

This is shell-only UI. It does not read or mutate show-day data, change the replication layer, or weaken offline-first behavior.

## Goals / Non-Goals

**Goals:**

- Give AskQ a recognizable, consistent Q-in-a-speech-bubble icon in both shell access points.
- Organize the account menu into identity/status, account/plan, assistance, appearance/information, and session groups.
- Present one plan destination based on the user's effective subscription state.
- Translate real network and sync state into one calm, truthful message.
- Preserve accessible names, compact-layout reachability, and existing handlers.

**Non-Goals:**

- Add or change an AskQ, help, billing, pricing, account, or appearance surface.
- Change subscription entitlement rules or introduce a billing abstraction.
- Change AskQ requests, answers, routing, or panel behavior.
- Change replication, mutation queues, persistence, or offline guarantees.
- Redesign role-specific or developer menu items beyond placing them after the account/plan group.

## Decisions

### 1. Use one reusable custom AskQ icon

Create `AskQIcon.tsx` as a small SVG component that accepts standard SVG props and draws a `Q` inside a speech bubble. Both `AppHeader` and `AccountMenuContent` use it.

This is preferred over `MessageSquare`, which reads as ordinary messaging, and over a bare question mark, which competes semantically with Help & Guides. A custom icon is preferable to duplicating inline SVG paths because the two access points must remain visually consistent.

### 2. Use separators as task-group boundaries

The menu order will be:

1. Identity and save status
2. Account and contextual plan destination
3. Existing role-specific destinations, when present
4. AskQ and Help & Guides
5. Appearance and About
6. Existing development tools in development builds
7. Sign out

Developer tools remain separated and low in the menu because they are environment-specific utilities. Role-specific destinations remain canonical links; this change does not move those workflows into the account menu or duplicate them elsewhere.

### 3. Derive one plan destination from `useSubscriptionGate`

Use the hook's existing `isPremium` result. Users whose shell-level subscription gate reports effective premium access see `Plan & billing` linked to `/subscription`. Free users see `View plans` linked to `/pricing-page`. While the hook reports `isLoading`, omit the plan action so the menu does not briefly send a premium user to pricing or a free user to billing.

This removes the choice between two overlapping billing labels while preserving both canonical pages. It avoids changing the subscription model or guessing from raw profile fields.

### 4. Translate real status into calm copy locally

The account menu will map the existing status values as follows:

| State | Copy |
| --- | --- |
| Offline | `Offline — changes saved here` |
| Error | `Some changes need attention` |
| Pending | `Saving changes...` |
| Synced | `All changes saved` |

Offline takes precedence using `useNetworkStatus`; the remaining mapping uses `useGlobalSyncStatus.status`. The copy does not claim server synchronization while offline and does not expose two competing technical concepts. Appropriate icons and restrained semantic colors distinguish the states without turning offline operation into an error.

This mapping stays in `AccountMenuContent` because it is presentation copy for one compact shell surface. It does not replace the detailed sync status component or change the underlying source of truth.

### 5. Keep accessible behavior stable

The icon-only header button retains `aria-label="AskQ Assistant"`. The menu uses the concise visible label `AskQ`. The custom SVG is `aria-hidden` because the surrounding button or menu text supplies its name. Existing minimum 44px header targets remain unchanged.

The theme item says `Light mode` in dark mode and `Dark mode` in light mode, describing the action's result. Sign out uses neutral default text and destructive foreground only for hover/focus feedback so it remains discoverable without dominating the menu.

## Risks / Trade-offs

- **A compact custom Q may lose clarity at 16px** → Use the same 24px view box and stroke conventions as Lucide, verify it in both 16px shell placements, and retain text/accessibility labels.
- **Subscription state may still be loading when the menu opens** → Omit the plan action until `useSubscriptionGate()` resolves rather than showing a potentially incorrect destination.
- **Simplified status copy hides detail** → Keep detailed sync surfaces unchanged; the account menu remains a glanceable summary derived from real state.
- **Conditional plan links can surprise returning users** → Use explicit labels that match the destination, and cover both states in component tests.

## Migration Plan

Ship the component and menu changes together behind no feature flag. Rollback is a normal code revert because there are no data, API, environment, or dependency changes.

## Open Questions

None. The user approved the Q-in-a-bubble icon and menu organization before implementation.
