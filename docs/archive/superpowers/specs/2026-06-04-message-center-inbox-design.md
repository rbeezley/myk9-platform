# Message Center Inbox Design

Date: 2026-06-04

## Problem

The top-bar bell currently behaves like a notifications preview: it shows alert and announcement snippets, links to notification history, and opens the existing `NotificationCenter`. Chat messages are separate. Exhibitors have no global message entry point, and secretary messages live in the sidebar at `/secretary/messages`.

This fragments the mental model. The intended product behavior is that the bell is the universal inbox/message center for every role.

## Duplication Check

This does not add a new messaging surface. It consolidates access to existing attention streams:

- Notifications from `notificationStore` and `/notifications`
- Announcements from `announcementStore`
- Show chat threads from `messageStore`, `/messages/:showId`, and `/secretary/messages`

Entry-card message links are no longer the right primary fix. They may be useful later as contextual shortcuts, but they are not justified until the global inbox behavior is correct.

## Design

Clicking the bell opens a slide-out **Message Center** panel. The panel uses the existing slide-out pattern rather than a small dropdown.

The tab order is:

1. **Notifications** — default for typical exhibitors because they will usually receive more notifications than direct messages.
2. **Announcements** — show broadcasts and official updates.
3. **Messages** — direct exhibitor/organizer conversations across relevant shows.

The bell badge counts unread notifications, unread announcements, and unread messages.

## Panel Shell

Use the existing `SlideOverPanel` shared shell, the same base used by `AskQPanel`, so behavior stays consistent:

- Backdrop click closes
- Escape closes
- Focus is trapped
- Body scroll is locked
- Mobile gets a full-width panel

Extend `SlideOverPanel` with a small `side?: 'left' | 'right'` option so Message Center can open from the left while existing right-side panels keep their current behavior.

## Components

- `NotificationBell` becomes the bell launcher for Message Center. It should stop rendering the current compact dropdown.
- `NotificationCenter` is renamed or evolved into `MessageCenterPanel`.
- Notification and announcement list rendering should be kept as focused child components where practical, rather than expanding one large component further.
- A new messages list child renders message threads from `messageStore`.

## Data Flow

Notifications continue to come from `useNotificationStore`.

Announcements continue to come from `useAnnouncementStore`.

Messages come from `useMessageStore`, but subscription scope must widen:

- Exhibitors: all shows where the user has current or upcoming entries that can produce organizer chat.
- Secretaries and club/admin roles: managed shows already represented by the secretary messages page.
- Multi-role users: union the relevant show IDs without duplicates.

Selecting a message thread closes the panel and routes to the existing surface:

- Exhibitor/non-staff: `/messages/:showId`
- Secretary/admin/club admin: `/secretary/messages?showId=:showId`

## Empty And Error States

Each tab has its own calm empty state:

- Notifications: "No notifications yet"
- Announcements: "No announcements yet"
- Messages: "No messages yet"

If message loading fails, the Messages tab shows a retry row without blocking Notifications or Announcements.

## Testing

Unit coverage should verify:

- Bell opens Message Center, not the old dropdown.
- Tab order is Notifications, Announcements, Messages.
- Bell unread badge includes all three unread sources.
- `SlideOverPanel` preserves existing right-side behavior and supports left-side opening.
- Messages tab routes staff and exhibitors to the correct existing message surfaces.
- Empty/error states render independently per tab.

Focused integration coverage should render `AppHeader` with mocked stores and assert the bell is the global inbox entry point for exhibitor-only and secretary roles.
