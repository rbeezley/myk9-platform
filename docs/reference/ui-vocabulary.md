# UI Vocabulary

> **Status:** Reference

One word per action, across every role. This is a lexicon, not a gate — nothing enforces it mechanically, so it lives or dies on review.

## Why it exists

An exhibitor reported that the show page's **"Add Classes"** button read as the secretary gesture of adding a new class to the show, not as entering a dog in an existing one. Both readings were true, and the noun could not settle it.

The deeper problem was that the app used **Add**, **New**, **Create** and **Enter** as interchangeable creation verbs, applied differently per noun and per role — while the same human wears several roles. A secretary shows their own dogs. A club admin enters trials. Vocabulary that asks the reader to first work out "which hat am I wearing on this screen?" costs more than it saves.

## The rule

**`Add` + `<noun>` = that noun now exists.**

The noun is always the thing that comes into existence — never the thing you interacted with to get there.

| Action                                  | Label           | The noun that now exists |
| --------------------------------------- | --------------- | ------------------------ |
| Exhibitor (or secretary) enters a dog   | **Add Entry**   | an entry                 |
| Secretary builds the show's schedule    | **Add Classes** | a class                  |
| Secretary adds a trial to a show        | **Add Trial**   | a trial                  |
| Secretary assigns a judge               | **Add Judge**   | a judge assignment       |
| Anyone registers a dog on their profile | **Add Dog**     | a dog                    |

Picking classes in the registration wizard creates an **entry**, not a class. That is why the exhibitor CTA is "Add Entry" and not "Add Classes" — the old label named the secretary's operation.

### Casing follows the surface, not the rule

The rule governs the words, not their case. Buttons and headings take title case (**Add Entry**); menu items, popover triggers and card summaries take sentence case (**Add entry**, **Add entry for my dog**). That is the app's existing convention and the table below reflects both — a casing difference between two rows is not a contradiction.

### Retired verbs

- **New** and **Create** — synonyms for `Add`. Use `Add`.
- **Enter** — no longer a creation verb, with one exception below.

### The one exception: "Enter This Show"

The public show page shows **"Enter This Show"** to anyone who has not entered yet, and **"Add Entry"** once they have.

This is not a role split. It turns on **visible state** — _have I entered this show yet_ — which the reader can confirm from the screen, never on an inferred role. A secretary who wants to show their own dog sees the identical button on the identical page as any exhibitor.

It survives because "enter a show" is the sport's own idiom (premiums say _entries close_; exhibitors say _I entered my dog_), and because it is the front door: "Add Entry" there reads like a database operation on a page whose job is to invite someone to compete.

## Reasons are not actions

**Do not put the reason into an action label.** A secretary entering a dog on someone's behalf may be working from a mailed entry form, a phone call, a walk-up, or fixing an exhibitor's mistake. It is one action. Naming a single reason makes the others look unsupported.

The trial secretary has **one** add-entry action (MYK9-1242): **Add Entry** (button) / **Add entry** (menu item), straight to the secretary flow, which searches or creates any exhibitor and dog, the secretary's own included. The whose-dog choice is gone for her.

The exhibitor route (picks from your own dogs) survives for a manager who is not the trial secretary and cannot enter the secretary flow:

- **Add entry for my dog**

"Mail-in" remains correct as a **domain noun** — the mail-in entry blank PDF, the Gazette entry form, help content about the mail-in workflow. It is banned only from action labels.

### Modes are not reasons

**Late entry** keeps its name (**"Add late entry"**). It is not a reason for the ordinary action — it is a different operation: it carries its own URL mode, returns to Entries (where its door lives since MYK9-954) instead of the show page, switches entry creation to the offline-first path, and turns off the client-side fullness check. The secretary needs to know which one they are in. Contrast with "mail-in", which changed nothing about what the software did.

Late-entry mode does **not** relax the entry-close deadline. That exemption is RBAC — `getEntryCloseSubmitBlocker` exits early for any non-exhibitor workflow and deliberately ignores the URL flag, since any exhibitor can append it.

## Nouns

One word per thing, in visible text only (MYK9-1857, from the MYK9-1819 audit). Code identifiers, database columns, routes and analytics keys keep their names. Guard: `apps/myk9show/src/test/ci/visibleWording.test.ts` fails on a visible "wait list" / "wait-list" and on a visible "Retry" label (any string that is "Retry" or starts with "Retry "); strings that mirror the server (such as an entry denial reason) keep its exact text and are listed in the guard; the other rows are applied by the sibling issues and by review.

| Thing                        | Say                                                                         | Not                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| The queue for a full class   | **waitlist** ("Leave waitlist")                                             | wait list, wait-list                                                                |
| Run an action again          | **Try again**                                                               | Retry                                                                               |
| The platform's cut           | **service fee**                                                             | platform fee, card processing fee                                                   |
| The club's money account     | **bank account**                                                            | payment account, Stripe                                                             |
| Who to contact               | **the show secretary** (show problems); **myK9Show support** (app problems) | trial secretary, show organizer, show team, the club, the administrator, club admin |
| Making an account            | **Create account**                                                          | Sign up, Sign Up, Create an account                                                 |
| Pay by card                  | **Credit/Debit Card**                                                       | Credit Card, Credit/Debit Card (Online), Credit/Debit Card (Online Payment)         |
| Pay by check                 | **Check (pay at show)**                                                     | Check (Pay at Show), Check at Show                                                  |
| Leaving a class              | **Pull or withdraw...** (leaving a waitlist: **Leave waitlist**)            | Leave class...                                                                      |
| Taking a dog out on show day | **Pull**                                                                    | Pull / no-show, absent, scratched                                                   |
| A copied link                | **Link copied**                                                             | URL copied, Link copied!                                                            |
| Wireless network             | **Wi-Fi**                                                                   | WiFi                                                                                |
| An entry                     | **entry**                                                                   | registration (kept only for a dog's registry number)                                |
| A free entry                 | **Free entry** (button: **Make free**)                                      |                                                                                     |
| Ending the show              | **Close the show**; "finish" is kept for a class                            | Finish the show                                                                     |

### Owner calls

A free entry is "Free entry" with the button "Make free"; closing a show is "Close the show", while "finish" stays for a class.

### Entry and "your entry"

`entry` / `entries` stays the noun for the record, everywhere it already appears: **My Entries**, **5 Entries**, **Entry Fees**, **Entries close Dec 1**, **Entries Management**.

The in-progress set an exhibitor is building and paying for is **"your entry"** in copy ("Your entry" side panel, "Added to your entry", "Nothing in your entry yet"); the header badge reads **"Entry in progress"**. The `/cart` URL and the code (cart store, `Cart*` components) keep "cart". Where an entry sits _inside_ that set, copy avoids the container noun ("2 entries saved, not yet paid", not "2 entries in your entry").

## Where this is applied

| Surface                              | Label                                                |
| ------------------------------------ | ---------------------------------------------------- |
| Show page — never entered            | Enter This Show                                      |
| Show page — already entered          | Add Entry                                            |
| Entry wizard — heading, breadcrumb   | Enter This Show / Enter                              |
| My Entries → Actions menu            | Add entry                                            |
| Entries Management — button          | Add Entry (club admin: Add entry for my dog)         |
| Entries Management — More popover    | Late entry / Add late entry                          |
| Per-class entries table              | Add Entry                                            |
| Offline / ringside entry form        | Add Entry                                            |
| Header + command menu                | Add entry (club admin also: Add entry for my dog)    |
| Shows page, empty states, shortcuts  | Add Show                                             |
| Show wizard — heading, submit button | Add Show                                             |
| Secretary dashboard, no shows yet    | Add your first show                                  |
| Show page — Trials tab, Show Map     | Add Trial                                            |
| Show page — Classes tab              | Add Classes                                          |
| Trial page, Setup → Classes          | Add Classes (opens the show wizard add-classes mode) |
| Dogs page, person profile            | Add Dog                                              |
| Add-dog panel — title, save button   | Add Dog                                              |
| Command menu                         | Add Dog / Add Show                                   |
| Header Actions menu — on a show      | Add Trial                                            |
| Header Actions menu — off a show     | Add Show                                             |

### "New" as an adjective

`new` survives where it separates a new person from picking an existing one in the same control, not as a synonym for `Add`: **Add new judge (person not in system)** and **Add new Show Chairman** in the show wizard's officials pickers. The action still starts with `Add`.

## Offline and updates

Audience: older, retired, low-computer-skill volunteers and exhibitors, usually at a venue on poor Wi-Fi (MYK9-1818). Say where the change is and what happens next, in the words a person would use out loud. The shared sentences live in `apps/myk9show/src/lib/offlineCopy.ts`.

| Say                                              | Instead of                                  |
| ------------------------------------------------ | ------------------------------------------- |
| saved on this device                             | queued, cached, local storage, stored local |
| will be sent when you are back online            | will sync, syncing, synced, backlog         |
| not been sent yet                                | unsynced, pending sync                      |
| update the app (a new version is applied)        | reload, refresh the page, new build         |
| restart the app (just starts it again)           | refresh app, reload                         |
| add to your home screen                          | install as a standalone app                 |
| we could not reach myK9Show                      | the server is down, server error            |
| this was changed somewhere else at the same time | conflict, record changed elsewhere          |
| keep the other change / keep my change           | use their change, take theirs, keep mine    |
| getting this device's show data back             | checking local data, resyncing              |
| saved data (the "Storage" section, staff)        | cache, cached data, clear cache             |

No em dashes in these strings.

Guard: `apps/myk9show/src/test/ci/visibleWording.test.ts` fails on any visible string with a bare "sync" (syncing, synced, resync), "queued", "server", "cache" or "reload", in app source, `packages/scoring-ui` and `packages/ringside` (MYK9-1928). Comments, identifiers, log calls, test files, className/data-* values and lowercase one-token keys never count. The System Health page, developer tools and code no screen mounts are exempt by path, and the few strings that keep a word on purpose (the development-only cache menu, "push alert queued", "Try again to reload the list", where the control only retries a query) are listed in the guard with the reason for each.

Rules:

- **"Update the app"** only where a newer version is really being applied (the update prompt in `main.tsx`, `StaleSchemaBanner`). **"Restart the app"** where the control just starts the app again: the account menu item (it applies a waiting update when there is one, otherwise it reloads the page). Never say "update" for a plain reload.
- The conflict notice says "This was changed somewhere else at the same time", then "Choose which change to keep. The other one is thrown away." with the buttons "Keep the other change" and "Keep my change". The words live in `offlineCopy.ts`; the Verify blocked reason uses the same constants.
- Today the Account "Storage" section is for staff only. The sync-failure toast's "Reason: ..." line is for staff only: an exhibitor-only account sees the headline and the buttons, not the line (`SyncFailureReason`). Staff (including stewards and chairmen who also exhibit) and anyone whose roles are not known yet still see it. The plain permission sentence ("You don't have permission to change this ...") is not a Reason line and shows to everyone.
- Point at the account menu with the words it really shows: "All changes saved", "Saving changes...", "Offline. Changes saved on this device".
