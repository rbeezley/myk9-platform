# Exhibitor Show Actions — inventory and one actions surface

> **Status:** Active

**Date:** 2026-09-17
**Linear:** MYK9-631 (acceptance criterion 1 only — inventory, no code)
**Method:** `.claude/skills/UX-Audit/references/ia-review.md` (then the `IA-Review` skill) Steps 1 and 4, scoped to _actions_ rather than routes (the route layer for this surface was already audited in [`ia-review-exhibitor-surface.md`](ia-review-exhibitor-surface.md)).
**Role intent:** Exhibitor — _"This respects my time."_ ([`INTENT.md`](INTENT.md) §Exhibitor)

## Scope

Every action an exhibitor can take **on a show** from My Shows (`/exhibitor/entries`) and its show card, plus the dialogs those actions open. Source read: `pages/MyEntriesPage/index.tsx` and `modules/`, `components/entries/EntryEditDialog.tsx`, `PullConfirmDialog.tsx`, `EntryReceipt.tsx`, the exhibitor sidebar, the command palette, and the public show-detail entry CTAs.

Confirmed on the deployed app (`https://myk9show.com`) as `exhibitor@myk9t.com`, desktop 1440×900 and 375×812, read-only — nothing was pulled, withdrawn, paid or dismissed. Evidence: the enumerated control set below, the two dialog transcripts, and six screenshots in the session scratchpad (`shots/{desktop,mobile}-{my-shows,orders-receipts,edit-entry}.png`; full-page captures are 10–11 MB each, so they are cited rather than committed).

### Does this duplicate an existing page?

No new page is proposed. Everything below either stays where it is, moves **under one trigger on the card it already belongs to**, or becomes a link. The in-repo precedent for the trigger is the secretary side's `features/show-map/ShowMapRowActionsMenu.tsx` — one `DropdownMenu` per row, grouped items, a separator before the destructive group. The precedent for _removing_ surfaces rather than adding one is [`archive/plan-show-map-workbench-collapse.md`](archive/plan-show-map-workbench-collapse.md), which deleted the Today and Wrap-up tabs because their concerns belonged in fewer places.

**Open structural question (for Richard):** [`plan-ia-exhibitor-surface.md`](plan-ia-exhibitor-surface.md) is `Active` with Phases B–D open and covers this same surface. This work is a sibling of its Phase C, not an independent plan. Should MYK9-631 become a phase of that plan instead of a second doc?

---

## 1. Action inventory

`Places` counts every distinct surface in the app where the same capability is offered. Line numbers are against `origin/main` at `c96e0e43e`.

### On the show card and the page around it

| Action (as the user reads it)     | Surface                       | Route                | component:line                                 | Places | Recommendation                                                                                         |
| --------------------------------- | ----------------------------- | -------------------- | ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| Enter a Show                      | page header button            | `/exhibitor/entries` | `MyEntriesPage/index.tsx:297`                  | 3      | keep — it leaves the card entirely; the sidebar "Find Shows" and the show-detail CTA are the other two |
| Finish Payment                    | page stat row                 | `/exhibitor/entries` | `MyEntriesOverview.tsx:59` → `CompactStatsRow` | 2      | keep — it is the all-shows total, a different number from the card's                                   |
| Finish payment                    | card, yellow money strip      | `/exhibitor/entries` | `MyShowGroup.tsx:270`                          | 2      | move under actions menu — same verb as the row above, differing only in a capital letter               |
| Contact the show secretary to pay | card, yellow strip (disabled) | `/exhibitor/entries` | `MyShowGroup.tsx:282`                          | 1      | keep — a sentence, not an action; must not become a menu item                                          |
| Dismiss                           | card, green paid strip        | `/exhibitor/entries` | `MyShowGroup.tsx:318`                          | 1      | keep on the strip — it dismisses **that notice**, not the show; a menu would orphan it                 |
| Orders & receipts                 | card link row                 | `/exhibitor/entries` | `MyShowGroup.tsx:198`                          | 2      | move under actions menu, renamed "Receipts"; My Payments' Receipt deep link is the other               |
| Edit entry                        | card link row                 | `/exhibitor/entries` | `MyShowGroup.tsx:206`                          | 1      | move under actions menu — and split: withdraw must not hide behind an "edit" verb                      |
| Message the show team             | card link row, post-deadline  | `/exhibitor/entries` | `MyShowGroup.tsx:217`                          | 1      | move under actions menu — and offer it always, not only once entries close                             |
| Add to calendar                   | card link row                 | `/exhibitor/entries` | `MyShowGroup.tsx:230`                          | 1      | move under actions menu                                                                                |
| View show →                       | card link row                 | `/exhibitor/entries` | `MyShowGroup.tsx:241`                          | 1      | move under actions menu, last item                                                                     |
| Get directions (venue name)       | card meta line                | `/exhibitor/entries` | `MyShowGroup.tsx:149`                          | 1      | keep — it is the address, read in place; duplicate into the menu only if Richard wants it              |

### Per dog and per class, inside the card

| Action                   | Surface           | Route                | component:line               | Places | Recommendation                                                                                              |
| ------------------------ | ----------------- | -------------------- | ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Check in for \<weekday\> | dog card, button  | `/exhibitor/entries` | `MyShowDogCard.tsx:82`       | 3      | keep — day-gated primary action                                                                             |
| Check in (one class)     | class row, link   | `/exhibitor/entries` | `MyShowClassRow.tsx:133`     | 3      | keep — `MyShowClassRow.tsx:5-8` is explicit that a gate-day affordance behind a disclosure is no affordance |
| change (check-in status) | class row, link   | `/exhibitor/entries` | `MyShowClassRow.tsx:123`     | 3      | keep — opens `CheckInStatusDialog`; one write path (`MyShowDogCard.tsx:5-13` INTENT)                        |
| New result / Result card | class row, button | `/exhibitor/entries` | `MyShowClassRow.tsx:188,220` | 1      | keep — the reveal is the moment the page exists for                                                         |

### Behind **Edit entry**, three clicks deep

| Action                           | Surface                      | Route                | component:line                | Places | Recommendation                                                                          |
| -------------------------------- | ---------------------------- | -------------------- | ----------------------------- | ------ | --------------------------------------------------------------------------------------- |
| Choose an entry to edit (picker) | dialog stage                 | `/exhibitor/entries` | `OrdersReceiptsList.tsx:167`  | 2      | delete for the edit path — see §2; the receipt path keeps a chooser                     |
| Pull (withdraw one class)        | `EntryEditDialog`, per class | `/exhibitor/entries` | `EntryEditDialog.tsx:349`     | 1      | **move to the card** — MYK9-631 AC3; it is the only way to withdraw and it is invisible |
| Pull from class? / Pull Entry    | confirm dialog               | `/exhibitor/entries` | `PullConfirmDialog.tsx:38,58` | 1      | keep the confirm, rename the verb — see §2                                              |
| Handler                          | `EntryEditDialog`, per class | `/exhibitor/entries` | `EntryEditDialog.tsx:383`     | 1      | keep inside Edit                                                                        |
| Jump Height                      | `EntryEditDialog`, per class | `/exhibitor/entries` | `EntryEditDialog.tsx:404`     | 1      | keep inside Edit                                                                        |
| Save Changes                     | `EntryEditDialog` footer     | `/exhibitor/entries` | `EntryEditDialog.tsx:440`     | 1      | keep                                                                                    |

### Behind **Orders & receipts**

| Action                         | Surface         | Route                               | component:line                | Places | Recommendation                                                        |
| ------------------------------ | --------------- | ----------------------------------- | ----------------------------- | ------ | --------------------------------------------------------------------- |
| Orders and receipts (picker)   | dialog stage    | `/exhibitor/entries`                | `OrdersReceiptsList.tsx:167`  | 2      | keep, relabel — see §2                                                |
| Choose a receipt (per payment) | second dialog   | `/exhibitor/entries`                | `OrdersReceiptsList.tsx:217`  | 1      | keep — a real second question (one registration, two Stripe payments) |
| Print / Save as PDF            | `EntryReceipt`  | `/exhibitor/entries`                | `EntryReceipt.tsx:283`        | 1      | keep                                                                  |
| Receipt (inbound deep link)    | My Payments row | `/exhibitor/payments` → `?orderId=` | `ScopedPaymentSummary.tsx:38` | 2      | keep — this is the link-don't-reimplement pattern already working     |

### Wait list, same page, separate section

| Action           | Surface       | Route                | component:line            | Places | Recommendation                                                              |
| ---------------- | ------------- | -------------------- | ------------------------- | ------ | --------------------------------------------------------------------------- |
| Complete payment | wait-list row | `/exhibitor/entries` | `WaitListSection.tsx:206` | 1      | keep                                                                        |
| Decline          | wait-list row | `/exhibitor/entries` | `WaitListSection.tsx:217` | 1      | keep                                                                        |
| **Withdraw**     | wait-list row | `/exhibitor/entries` | `WaitListSection.tsx:226` | 1      | keep the verb — and adopt it for entries, so one page stops using two words |

### Filters and page furniture

| Action                                             | Surface           | Route                | component:line             | Places | Recommendation                                                 |
| -------------------------------------------------- | ----------------- | -------------------- | -------------------------- | ------ | -------------------------------------------------------------- |
| When: All · Upcoming · Completed                   | chip radiogroup   | `/exhibitor/entries` | `EntryFilterStrip.tsx:117` | 1      | keep — decided as A1 in `plan-ia-exhibitor-surface.md` Phase A |
| Status: Any status · Pending · Accepted · Waitlist | chip radiogroup   | `/exhibitor/entries` | `EntryFilterStrip.tsx:125` | 1      | keep, add a sentence — see §2                                  |
| Clear scope                                        | scope banner      | `/exhibitor/entries` | `EntryScopeBanner.tsx`     | 1      | keep                                                           |
| Add Dog                                            | dog strip         | `/exhibitor/entries` | `MyEntriesOverview.tsx:73` | 2      | keep — the command palette's "Add New Dog" is the other        |
| Go to show day                                     | `ShowTodayBanner` | `/exhibitor/entries` | `ShowTodayBanner`          | 2      | keep — the sidebar "Ringside" is the other                     |

### Elsewhere, for completeness

| Action                                     | Surface          | Route        | component:line                           | Places | Recommendation                                                                                                                    |
| ------------------------------------------ | ---------------- | ------------ | ---------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Enter This Show / Add Classes / View Entry | show-detail hero | `/shows/:id` | `ShowExhibitorView.tsx:109,121`          | 1      | **out of scope** — MYK9-565 is trimming these to header plus sticky; do not touch                                                 |
| See classes                                | show-detail hero | `/shows/:id` | `ShowExhibitorView.tsx:94`               | 1      | out of scope                                                                                                                      |
| (no exhibitor entry action at all)         | command palette  | global (⌘K)  | `components/common/CommandPalette.tsx`   | 0      | note — the palette offers Dogs/Users/Shows/Clubs and three "Add New"; an exhibitor cannot reach pay, receipts or withdraw from it |
| `EntryCTA`                                 | orphan component | —            | `components/shows/overview/EntryCTA.tsx` | 0      | **delete** — no importer outside its own test (`test/components/EntryCTA.test.tsx`)                                               |

### What the walk found that the code read did not

- **Withdraw is unreachable from the card.** The confirmed control set on a card with a live entry is exactly: `Orders & receipts`, `Message the show team`, `Add to calendar`, `View show`, `Dismiss`, `change`, `Edit entry`, `Finish payment`, `New result`. No withdraw, no pull, no scratch.
- **The order picker's id fragment is not even unique.** 63 of the 65 rows in "Choose an entry to edit" read `A1090000`; only the trailing dog name tells them apart. The fragment costs a column and disambiguates nothing.
- **`Finish Payment` and `Finish payment` are both on screen at once**, ~300px apart, quoting different numbers ($90.00 due of $38,105.00 entered at page level; the show's own balance on the card).

---

## 2. Labels an exhibitor cannot be expected to understand

| Label as it renders                                             | Where                                  | component:line                                                                     | Why it fails                                                                                                                                                                                             |
| --------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Sep 16, 2026 · A1090000 · Juni`                                | "Choose an entry to edit" row          | `OrdersReceiptsList.tsx:140`, fragment minted at `:90`                             | An 8-hex slice of a UUID, repeated identically on 63 rows                                                                                                                                                |
| `Edit order 94DB1B95 — Juni` (aria-label)                       | same rows, screen-reader name          | `OrdersReceiptsList.tsx:130-136`                                                   | The fragment is read aloud too, ahead of the dog                                                                                                                                                         |
| "order" / "orders"                                              | picker title, description, button copy | `OrdersReceiptsList.tsx:179-185`                                                   | An exhibitor entered a dog in a class; they did not place an order                                                                                                                                       |
| "Orders & receipts"                                             | card link row                          | `MyShowGroup.tsx:204`                                                              | Same word, on the surface that has to be understood first                                                                                                                                                |
| `Confirmation # MK9-000145`                                     | printed receipt                        | `EntryReceipt.tsx:358-364`                                                         | Defensible on a receipt; meaningless as a way to choose which dog to edit                                                                                                                                |
| `Entry ID: ff090774-c45b-4c5b-b10c-ec4c067e6a28`                | printed receipt footer                 | `EntryReceipt.tsx:562`                                                             | A raw UUID on the document exhibitors print and file                                                                                                                                                     |
| Order id, monospace                                             | printed receipt                        | `EntryReceipt.tsx:551-554`                                                         | A second identifier on the same page, unexplained                                                                                                                                                        |
| "Pull from class?" / "Pull Entry" / "Pulling…"                  | confirm dialog                         | `PullConfirmDialog.tsx:38,58,56`                                                   | Ringside jargon; the same page says **Withdraw** for a wait-list position (`WaitListSection.tsx:226`)                                                                                                    |
| Badge `Pulled`                                                  | `EntryEditDialog`, per class           | `EntryEditDialog.tsx:347`                                                          | A third word for one act, after "Pull" and "withdraw"                                                                                                                                                    |
| `pulled` · `withdrawn` · `scratched` · `moved` · `not accepted` | class row state column                 | `MyShowClassRow.tsx:39-58`                                                         | Five internal lifecycle words — and `pulled` here is a **different** state from the dialog's `Pulled` (the comment at `:45-51` says so)                                                                  |
| `withdrawn` stored as `'scratched'`                             | edit dialog local state                | `EntryEditDialog.tsx:264`                                                          | The mismatch is in the code, not only in the copy                                                                                                                                                        |
| "Any status · Pending · Accepted · Waitlist"                    | status chips                           | `EntryFilterStrip.tsx:125`, defs in `entryTabDefs.ts`                              | Secretary-review vocabulary; and the When and Status rows silently narrow each other — status counts re-scope to the selected time window (`EntryFilterStrip.tsx:5-10`) with nothing on screen saying so |
| `entry.id.slice(0, 8).toUpperCase()`                            | three more mint sites                  | `useMyEntriesData.ts:282`, `CardDerivedReceipt.tsx:56`, `MyEntriesDialogs.tsx:347` | Deleting the fallback in `OrdersReceiptsList` alone leaves three producers; the data layer mints it before any component sees it                                                                         |

Not exhibitor-facing on this page, listed so a later grep does not read as a miss: `PaymentService.ts:330` (`RCPT-…`), `useEntryManagementData.ts:123` (secretary entry numbers), `AskQAppHelpContent.tsx:84` (support ticket id).

---

## 3. Proposed shape for the one actions surface

One `⋯ Actions` trigger in the card header, replacing the four-link row. Items in this order, each hidden when it does not apply:

1. ~~Finish payment~~ — dropped from the menu on 2026-09-17 by the placement rule in `docs/plan-secretary-show-actions.md` (a status banner keeps its own button and the verb is not repeated in the menu); the yellow money strip keeps its Pay button, retitled to the amount
2. **Add classes** → the registration wizard for this show
3. ~~Withdraw a dog from a class~~ — moved OUT of the menu on 2026-09-18 (Q4 below): it is a **Leave class…** control on each class row, opening `RemoveFromClassDialog` for that class id. No order picker either way, which is what AC3 asked for
4. **Change handler or jump height** → today's `EntryEditDialog`, minus its removal column (which now lives on the row)
5. **Receipts** → today's receipt path, rows labelled `Juni · Interior Advanced, Exterior Excellent · entered Sep 16`
6. **Add to calendar**
7. **Message the show team** (always, not only after entries close)
8. **View show page**

**Deliberately outside the menu**, and this is why the list is short: the check-in controls (`Check in for <weekday>`, per-class `Check in`, `change`) stay where they are, because `MyShowClassRow.tsx:5-8` already argues that at the gate, on a phone, an affordance you have to expand is an affordance you do not have. `Dismiss` stays on the strip it dismisses. The result reveal stays on the class row.

---

## 4. Open questions — answered

Every question below was **decided as an assumption when AC2–AC6 were built**, so the implementation could land without blocking on a round trip. Richard can override any of them; each names the PR that acted on it.

> **Note on the PR numbers.** #2334 was the original PR. Its head commit reached `main` inside an unrelated push before its `adversarial` review ran, and was backed out by `94b289843`. The same work is re-landed, reviewably, as **#2336**.

1. **Separate plan doc stays** — decided (assumption, PR #2334; re-landed as #2336). This doc is not folded into [`plan-ia-exhibitor-surface.md`](plan-ia-exhibitor-surface.md). That plan's Phases B–D are route-level; this one is action-level, and merging them would bury the inventory table.
2. **NOT one verb** — decided (assumption, PR #2334; re-landed as #2336). MYK9-632 settled it the other way: Withdraw (a reason the registry recognises, refund per the premium) and Pull (any other reason, refund at the club's discretion) are two different acts with two different money consequences, and `RemoveFromClassDialog` states both before anything is clicked. The wait-list row's **Withdraw** stays. What PR #2334 removed is the leftover `Pull from class?` / `Pulling…` copy MYK9-632 had not already replaced.
3. **"Add classes" is a LINK** — decided (assumption, PR #2334; re-landed as #2336). The menu item navigates to `/shows/:id`, the registration wizard's entry point. No second registration surface; the show page owns "which classes are still open".
4. **A ROW verb, not a menu item** — decided (assumption, PR #2334; re-landed as #2336). Each `MyShowClassRow` carries a **Leave class…** control (screen-reader name `Withdraw or pull <Dog> from <Class>`) that opens `RemoveFromClassDialog` for that class id. No order picker, and no "Withdraw a dog from a class" menu item — that would repeat a row verb in the menu. Which rows offer it is `leaveClassRow.ts`: not once the class has run, and not once the entry is already removed. Whether THIS entry may be withdrawn or pulled stays the server's call, surfaced inside the dialog.
5. **A labelled `Actions` button** — decided (assumption, PR #2334; re-landed as #2336). One per show card header, built on the same `DropdownMenu` primitive as `features/show-map/ShowMapRowActionsMenu.tsx`. Below `sm` the word is hidden and only the icon shows; the trigger's `aria-label` names the show either way.
6. **Deleted in the same PR** — decided (assumption, PR #2334; re-landed as #2336). `components/shows/overview/EntryCTA.tsx` and `test/components/EntryCTA.test.tsx` are gone; nothing imported the component outside its own test.
7. **Keep the confirmation number, drop the other two** — decided (assumption, PR #2334; re-landed as #2336). `Confirmation # MK9-000145` is defensible on a receipt and is now the ONLY identifier the document prints. The `Entry ID:` UUID footer and the monospace order id are deleted, `orderId` is off `EntryReceiptData` entirely, and the field is optional because nothing mints a stand-in for it any more.
8. **Its own issue** — decided (assumption, PR #2334; re-landed as #2336). The When/Status chips narrowing each other silently is out of scope here; filed as **MYK9-657** and linked from MYK9-631.
9. **The row control is NOT gated on the entry-close deadline** — decided (assumption, PR #2336 round 1). _Raised by review, not by the original inventory._

   The old path reached `RemoveFromClassDialog` only through the Edit sheet, which was double-gated: the header offered it only while `canEdit` (an editable status **and** the close date not passed), and the sheet then ran `canModifyEntry(showId)`, which refuses once the entry-close day is past. So on the base an exhibitor could not self-withdraw at all after entries closed.

   The row control consults `ClassRowKind`, `isPastShow`, `unresolved` and `showId` — **not** the deadline. That is deliberate, and it matches MYK9-632 AC2: _Pull is always available before the class runs; Withdraw is disabled with its reason after the registry's cutoff._ A deadline gate would make the feature nearly unreachable — the cases MYK9-632 was built for (a bitch in season the week of the show, a judge change announced after entries close) all happen **after** the close date, and a withdrawal recorded then is precisely what carries the refund obligation under the premium.

   Withdraw's own cutoff is therefore enforced where it belongs: inside the chooser, by `withdrawalPolicy` and the server's `evaluateWithdrawEligibility`, which disable the arm **and say why** rather than hiding the control. Pull stays available because a club can always exercise its discretion.

   This is a money-path policy change and the owner can reverse it. Reversing it means re-adding a `canModifyEntry`-equivalent term to `canLeaveClass`, and accepting that an exhibitor with a vet certificate the day before the show has no way to record it.

**Round 2 (delta lens).** All seven round-1 fixes closed by mutation and the merge verified trivial. Four new findings, two of them on the code round 1's focus fix had just introduced — the stop-and-restructure signal in CLAUDE.md § Gates step 3 — so that mechanism was **deleted** rather than patched again: the `my-show-dog-${dogId}` anchor was a duplicate DOM id whenever one dog is entered in two shows, and its test hand-built the span, so renaming the id in the component left the whole suite green. The original focus drop is filed as **MYK9-658**. The receipt's `Reference` became an order-level token (`registrationId`, then the Stripe order id) rather than `entry.id`, which is one class row of a multi-dog order and not stably chosen across the two read paths; the registration-less residue is **MYK9-659**. The `Leave class…` control's accessible name now leads with its visible label (WCAG 2.5.3).

**Not adopted from round 1.** Lens L suggested `Add classes` and `View show page` be collapsed into one item because both emitted `/shows/:id`. They are two different verbs, so the fix taken was to point `Add classes` at the wizard's own route (`/shows/:id/register`, `publicRoutes.tsx`) rather than to drop an item.

### What the menu holds, as shipped

In order, each item hidden when it does not apply:

| Item                          | What it does                                                       | Hidden when                             |
| ----------------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| Add classes                   | link to `/shows/:id`                                               | no show id, nothing editable, past show |
| Change handler or jump height | today's `EntryEditDialog`, **minus** its removal column            | nothing editable                        |
| Receipts                      | today's receipt path                                               | the show holds no order                 |
| Add to calendar               | `AddToCalendarDialog`                                              | no show id                              |
| Message the show team         | link to `/messages/:id` — **always**, not only after entries close | no show id                              |
| View show page                | link to `/shows/:id`                                               | no show id                              |

**Deliberately outside the menu:** `Finish payment` (the yellow strip keeps its own button, retitled `Pay $45.00` — a status banner does not hand its verb to the menu, and the page header already carries an all-shows total under nearly the same words), `Dismiss` (stays on the green strip it dismisses), the check-in controls (`MyShowClassRow.tsx:5-8` — at the gate, on a phone, an affordance you have to expand is an affordance you do not have), the result reveal, and leaving a class (a row verb, per Q4).

### Original questions, for the record

1. Should this become a phase of [`plan-ia-exhibitor-surface.md`](plan-ia-exhibitor-surface.md) (Active, Phases B–D open on this exact surface) rather than a separate plan?
2. **One verb for stopping an entry**: Withdraw, Pull, or Scratch? The wait-list row already says Withdraw; the code says `scratched`. Picking one changes copy in four components.
3. Item 2 above ("Add classes") duplicates the show-detail hero CTA that MYK9-565 is trimming. Link from the menu to `/shows/:id`, or offer it in the menu too?
4. Is "Withdraw a dog from a class" one menu item opening a list, or one control per class row? A card with 65 orders (the seeded account) argues for the dialog; a card with one dog argues for the row.
5. Should the trigger be a `⋯` icon button (matching `ShowMapRowActionsMenu`) or a labelled **Actions** button? The exhibitor audience leans labelled.
6. Delete the orphan `EntryCTA.tsx` and its test in the same PR, or file it separately?
7. Receipt identifiers: keep `Confirmation # MK9-000145`, drop the `Entry ID:` UUID footer and the monospace order id, or drop all three?
8. The When/Status chips narrow each other silently. In scope here, or its own issue?
