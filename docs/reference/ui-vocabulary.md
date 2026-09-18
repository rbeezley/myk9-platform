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

The rule governs the words, not their case. Buttons and headings take title case (**Add Entry**); menu items, popover triggers and card summaries take sentence case (**Add entry**, **Add entry for someone else**). That is the app's existing convention and the table below reflects both — a casing difference between two rows is not a contradiction.

### Retired verbs

- **New** and **Create** — synonyms for `Add`. Use `Add`.
- **Enter** — no longer a creation verb, with one exception below.

### The one exception: "Enter This Show"

The public show page shows **"Enter This Show"** to anyone who has not entered yet, and **"Add Entry"** once they have.

This is not a role split. It turns on **visible state** — _have I entered this show yet_ — which the reader can confirm from the screen, never on an inferred role. A secretary who wants to show their own dog sees the identical button on the identical page as any exhibitor.

It survives because "enter a show" is the sport's own idiom (premiums say _entries close_; exhibitors say _I entered my dog_), and because it is the front door: "Add Entry" there reads like a database operation on a page whose job is to invite someone to compete.

## Reasons are not actions

**Do not put the reason into an action label.** A secretary entering a dog on someone's behalf may be working from a mailed entry form, a phone call, a walk-up, or fixing an exhibitor's mistake. It is one action. Naming a single reason makes the others look unsupported.

The two paths at the add-entry decision point differ by **whose dog**, which really does change the flow — the exhibitor route picks from your own dogs, the secretary route searches or creates any exhibitor and dog:

- **Add entry for my dog**
- **Add entry for someone else**

"Mail-in" remains correct as a **domain noun** — the mail-in entry blank PDF, the Gazette entry form, help content about the mail-in workflow. It is banned only from action labels.

### Modes are not reasons

**Late entry** keeps its name (**"Add late entry"**). It is not a reason for the ordinary action — it is a different operation: it carries its own URL mode, returns to the Show Desk instead of the show page, switches entry creation to the offline-first path, and turns off the client-side fullness check. The secretary needs to know which one they are in. Contrast with "mail-in", which changed nothing about what the software did.

Late-entry mode does **not** relax the entry-close deadline. That exemption is RBAC — `getEntryCloseSubmitBlocker` exits early for any non-exhibitor workflow and deliberately ignores the URL flag, since any exhibitor can append it.

## Nouns are unaffected

`entry` / `entries` stays the noun for the record, everywhere it already appears: **My Entries**, **5 Entries**, **Entry Fees**, **Entries close Dec 1**, **Entries Management**. The rule governs verb phrases only.

## Where this is applied

| Surface                              | Label                                             |
| ------------------------------------ | ------------------------------------------------- |
| Show page — never entered            | Enter This Show                                   |
| Show page — already entered          | Add Entry                                         |
| My Entries → Actions menu            | Add entry                                         |
| Show Desk — add-entries card         | Add entries                                       |
| Entries Management — popover trigger | Add entry                                         |
| …decision point, own dog             | Add entry for my dog                              |
| …decision point, on behalf           | Add entry for someone else                        |
| Show Desk late-entry card            | Late entry / Add late entry                       |
| Per-class entries table              | Add Entry                                         |
| Offline / ringside entry form        | Add Entry                                         |
| Header + command menu                | Add entry for my dog / Add entry for someone else |

## Not yet done

The `Add` / `New` / `Create` collapse across the remaining nouns (Show, Dog, Trial, Class, Judge) is outstanding — a survey at the time of writing found all three verbs in use for Show and for Dog. Tracked separately; this document is the standard it should be swept against.
