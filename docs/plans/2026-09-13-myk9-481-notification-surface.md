# MYK9-481 notification surface consolidation

## Evidence and decision

`public.notifications` has zero rows in the linked database, and the repository has no production writer for it. Its only app reader is `useDbNotifications`, used by the unlinked `/notifications` page. The bell opens Message Center, whose show-message tab reads `show_message_threads` and `show_messages` through `messageStore`; show-wide posts read `show_announcements` through `announcementStore`. Ring alerts are transient, local show-day signals. The show-message tables contain a populated thread and message in the linked database. No migration or shared database write is needed.

The `/notifications` page duplicates the bell's purpose and promises delivery from an unused table. Delete the route, page, and sole-use hook. Keep Message Center as the reachable notification surface. Preserve its existing local ring alerts and durable show-message paths; this issue does not rebuild delivery architecture. No registration wizard files change. This is narrow consolidation rather than a new product capability, so the lightweight workflow is appropriate instead of OPSX.

## Implementation

1. Remove the orphan route, page, and sole-use hook.
2. Test that the page route is gone and that populated show-message data still reaches the Message Center.
3. Record the routed-but-unregistered count using static `<Route path="...">` literals in the six `src/routes/*Routes.tsx` files. Extract each literal with `/<Route\b[^>]*?\bpath\s*=\s*["']([^"']+)["']/gs`, de-duplicate exact path strings, then compare them against quoted path keys in `routeRegistry.ts` and `path:` entries in `pageDirectory.ts`. After removing `/notifications`, **56** other unique static route paths are absent from both lists, including `/account`. The six files contain 108 unique static route paths. This deliberately excludes dynamic path expressions and routes declared outside those six files, while including relative paths, compatibility redirects, and development routes. A broader extraction can therefore produce a different count; this is a bounded inventory, not an exhaustive route audit.

## Testing and evidence

Run focused route, Message Center, and message-store tests; app typecheck and lint; format and code-quality checks. A read-only linked-database check found one real `show_messages` row and one thread, with zero `public.notifications` rows. The panel test uses a populated store fixture, and the existing message-store test uses mocked rows shaped like `show_messages` to verify hydration. These tests do not claim to display the live row itself. Richard approved revising the acceptance criterion from live `notifications` rows to this real-source check plus populated-state coverage; the revised criterion is recorded in MYK9-481.
