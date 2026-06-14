# Message Show Consolidation Design

**Date:** 2026-06-01
**Status:** Approved design
**App:** myK9Show

## Goal

Consolidate secretary show messaging into one show-scoped workflow. A secretary should not have to choose between Quick Broadcast, Class Broadcast, and a separate messages page when the intent is simply: "tell people connected to this show something."

This follows the current consolidation phase: tighten the existing show workflow instead of adding another page or duplicating compose UI.

## Decision

Replace the separate Show Desk tools **Quick Broadcast** and **Class Broadcast** with one tool:

**Message Show**

`/secretary/messages?showId=...` remains, but its job becomes conversation history and replies for that show. It should not be a competing primary compose surface.

## User Model

Most messages are related to one show before, during, or after the event. The show workbench is therefore the primary place to send show-scoped messages.

The secretary should think in recipient intent:

- Everyone in show
- A class
- Everyone checked in

The app should choose the correct delivery lane behind the scenes.

## Message Show Tool

The Show Desk tools panel gets one **Message Show** section.

### Controls

- **Recipient**
  - Everyone in show
  - A class
  - Everyone checked in
- **Class picker**
  - Only shown when recipient is `A class`
  - Labels use human class names, including element, level, and section when applicable
  - Never display raw UUIDs
- **Shortcuts**
  - Lunch is ready
  - Ring paused
  - Results posted
  - Report to gate
  - Class delayed
- **Message**
  - Editable before sending
  - Title shown only when the selected recipient path creates a show announcement
- **Send push alert**
  - Label: `Send push alert`
  - Helper text: `Also notify recipients outside the app.`
- **History/replies**
  - Link to `/secretary/messages?showId={showId}`

## Delivery Behavior

The composer keeps the backend distinction between announcements and targeted messages, but hides that distinction from the secretary.

| Recipient | Push alert off | Push alert on |
| --- | --- | --- |
| Everyone in show | Create a show announcement/feed item | Create a high-priority show announcement/feed item that also triggers push |
| A class | Send targeted in-app messages to class recipients | Send targeted in-app messages plus lock-screen/browser push |
| Everyone checked in | Send targeted in-app messages to checked-in recipients | Send targeted in-app messages plus lock-screen/browser push |

If push alert is off, recipients only see the message in myK9Show: announcement feed, message thread, in-app badge, or in-app toast depending on where they are. Users who are not signed in and do not have the app open do not receive an outside-app notification.

If push alert is on, recipients can receive a system notification only if they previously allowed notifications and the app has a saved push subscription for that user/device or passcode session.

## `/secretary/messages`

Keep `/secretary/messages?showId=...` as the show conversation center:

- Thread list
- Thread detail
- Replies
- Group-message history
- Link back to the show workbench

The page may still expose a compose button, but it must reuse the same **Message Show** composer rather than maintaining separate recipient/copy logic.

## Non-Goals

- Do not add a new messaging page.
- Do not make all messages announcements.
- Do not remove private/direct threads.
- Do not add one-off message shortcuts in multiple places.
- Do not change the underlying database model in this consolidation pass unless implementation reveals a required contract gap.

## Implementation Shape

Extract a reusable show-scoped composer from the existing Show Desk cards:

- Move Quick Broadcast template data and Class Broadcast template data into one message-show helper module.
- Reuse the current `show_announcements` lane for everyone-in-show announcements.
- Reuse `send-targeted-message` for class and checked-in recipients.
- Reuse existing class-label helper behavior so UUID-like element/level values do not leak into the UI.
- Replace the two Show Desk sections with one `MessageShowCard` or equivalent.
- Wire `/secretary/messages` compose entry to the same component or the same headless hook/helper contract.

## Error Handling

- Missing title/body: show plain-language validation near the composer.
- No class selected: disable send and explain that a class is required.
- No recipients: disable send and explain that there is nobody to message for that target.
- Failed announcement post: keep the edited copy in place and show `Could not send message`.
- Failed targeted send: keep the edited copy in place and show `Could not send message`.
- Push failures must not prevent non-push in-app delivery. The UI should report the message as sent when the in-app lane succeeds and, where available, note that push delivery may have failed.

## Testing

Add focused coverage before considering implementation complete:

- Helper tests for shortcut defaults and recipient-to-delivery-lane mapping.
- Class-label tests proving human labels render and UUID-like values are ignored.
- Component tests for:
  - selecting each recipient type
  - applying each shortcut family
  - toggling push alert
  - sending everyone-in-show through announcement payloads
  - sending class and checked-in through targeted-message payloads
  - preserving edited copy after failures
- Show workbench integration test proving Quick Broadcast and Class Broadcast are replaced by one Message Show tool.
- Messages page test proving its compose entry reuses the consolidated composer behavior or shared send contract.

## Rollout

Ship as one focused PR:

1. Introduce the shared message-show helper/composer.
2. Replace the two Show Desk tools with one Message Show tool.
3. Reuse the shared composer/send contract from `/secretary/messages`.
4. Remove obsolete Quick Broadcast/Class Broadcast UI tests after equivalent Message Show coverage exists.
5. Update `OPEN-TODOS.md` to mark the consolidation complete.

Manual verification:

1. Open a show workbench.
2. Send `Lunch is ready` to everyone without push and confirm it appears in the show feed.
3. Send `Lunch is ready` to everyone with push and confirm push delivery on a subscribed device.
4. Send `Report to gate` to one class without push and confirm recipients see it in messages.
5. Send `Report to gate` to one class with push and confirm tap opens the expected show route.
6. Open `/secretary/messages?showId=...` and confirm history/replies are available without a competing composer.
