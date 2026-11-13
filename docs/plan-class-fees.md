# Class fees: the show's fee is the default, a class's own fee wins

> **Status:** Active

Linear: MYK9-1931. Agreed with the owner in a design conversation on 2026-11-13. No code has been written.

## Why

Some clubs charge more for higher levels or for particular classes. The app cannot do that today on a show that has an entry fee, which is every show the setup wizard creates.

One database function prices every entry (`private.price_entry_fee`, `supabase/migrations/20260930214300_myk9_878_junior_handler_fee_pricing.sql`). Its order is:

1. the show's day-of fee, when the entry is day-of and that fee is above zero
2. otherwise the show's pre-entry fee
3. the class's own fee, only when the show has no fee
4. otherwise $0

The client quotes with the same rule (`getShowEntryFee`, `components/shows/RegistrationWorkflow/PaymentStep/utils.ts`).

Meanwhile the class edit form offers a "Fee Structure" section with "Pre-Entry Fee" and "Day-of-Show Fee" fields (`components/panels/edit/ClassEditForm.tsx`). On a show with a fee, whatever is typed there changes nothing an exhibitor is charged. Not traced: whether those fields save, and how reachable that form is today.

## Owner decision

**The show's fee is the default. A class's own fee wins when one is set.** (2026-11-13)

## The data says a plain flip is unsafe

A read of the linked database on 2026-11-13 (296 classes, 43 shows):

| Class fee                          | Classes |
| ---------------------------------- | ------- |
| Same as its show's pre-entry fee   | 273     |
| Zero                               | 22      |
| Empty                              | 1       |
| Above zero and different from show | 0       |

So today a class's fee is a copy of the show's fee made when the class was created (`classDataToReplicatedClass.ts` writes `preEntryFee || entryFee`), not a choice. Reversing the order without fixing that would cause two failures:

- **A stale copy wins.** The secretary changes the show's fee from $25 to $28. Every class still holds its $25 copy, and the copy now wins. Her change is silently ignored.
- **Zero becomes free.** The 22 classes holding 0 would price entries at $0 if zero counts as "set".

These are test data, but the same copying would happen on a real show.

## Design

**Empty means "use the show's fee".** A class holds a fee only when the secretary chose one for it.

1. **Stop copying.** Creating a class leaves its fee empty.
2. **Clean up once.** A migration empties every class fee that equals its show's pre-entry fee or is zero. Query the table first and record the counts in the PR. A fee above zero that differs from the show's is a real choice and is kept; today there are none.
3. **Flip the order** in `private.price_entry_fee` and in `getShowEntryFee` together: the class's fee when it is set and above zero, otherwise the show's.
4. **Zero is not a price.** Free entries already have their own path ("Free entry" when the secretary adds one). A class fee of zero is treated as empty, the same way a zero day-of fee already means "no day-of tier".

### Day-of entries

A class has one fee column; there is no class day-of fee. Open question for the owner (below). Until answered, the recommendation is: the show's day-of surcharge, meaning its day-of fee minus its pre-entry fee, is added to whatever the class costs. A Master class at $30 on a show charging $25 pre-entry and $30 day-of would be $35 on the day.

The class form's "Day-of-Show Fee" field has no column behind it and is removed, whichever way that question is answered, unless the answer is a per-class day-of fee.

### What the secretary sees

- **Class edit form:** one field, "Entry fee for this class", empty by default, with the hint "Leave empty to charge the show's fee ($25)."
- **Class list:** a class with its own fee shows it. A class without one shows nothing, so exceptions stand out.
- **Several classes at once:** the class list's bulk edit gains "Set entry fee", so all Master classes can be priced in one step. Clearing the field in bulk returns them to the show's fee.
- **Show fee field:** when some classes have their own fee, the show's fee field says so: "3 classes have their own fee."

### What the exhibitor sees

The entry wizard and the premium already quote per class. They must quote the class's fee where it has one. Find every place a fee is displayed or summed and confirm each reads the one rule; the plan's Phase 0 lists them.

### Entries already made

Changing a class's fee does not reprice entries that exist. An entry keeps the fee it was priced at. The class form says so when the class has entries: "This changes the fee for new entries only. 6 existing entries keep the fee they were charged."

## Does this duplicate an existing surface?

No. It makes existing fields work and removes one that cannot. No new page. The bulk action joins the class list's existing bulk edit.

## Open questions for the owner

1. **What varies the price in practice?** By level, by particular class (Detective), or something else. The design above covers both, since it is per class.
2. **Does the day-of surcharge vary by class**, or is it one amount added to whatever the class costs? The recommendation above assumes one amount.
3. **Does any club price by count**, such as a lower fee for a second entry of the same dog? Not planned unless clubs do it.
4. **Junior handler fee.** Today it is the lower of the junior fee and the normal fee. With a dearer class, a junior still pays the junior fee. Confirm that is wanted.

## Phases

**Phase 0: establish the facts.** Every place a fee is quoted, displayed or summed, on the client and the server (the grep for `price_entry_fee` finds eight migrations; `getShowEntryFee` callers; the premium; the entry blank; the cart and its recovery; the Financial Report). Whether the class form's fee fields save today and where the form is reachable. Re-run the data read above against the linked database.

**Phase 1: the rule.** The migration: clean-up of copied and zero fees, then the new order in `private.price_entry_fee`. The same order in `getShowEntryFee`. Stop copying at class creation. Money work with a migration: its own branch, never batched, `independent` review.

**Phase 2: the secretary's controls.** The class form field and hint, the class list display, the bulk action, the note on the show's fee field, the "new entries only" note.

**Phase 3: the exhibitor's quotes.** Every surface from Phase 0 reads the one rule.

**Phase 4: testing.**

- Assertion first: the server function and the client function return the same fee for the same inputs, across show fee only, class fee set, class fee zero, class fee empty, day-of, and junior.
- Database test for the migration's clean-up: a copied fee is emptied, a zero is emptied, a different fee is kept.
- A show whose fee changes after classes exist charges the new fee in classes without their own.
- An existing entry keeps its fee after its class's fee changes.
- One end-to-end walk: price one class higher, enter a dog in it and in a normal class, and check the wizard, the cart, the entry form's total and the Financial Report agree.

## Connections

- Class change requests (MYK9-1929): its "owes $5" depends on this. Without class fees, a class change within one show never changes what is owed.
- Day-of entry payment (MYK9-1930): a dearer class makes an unrecorded cash payment a larger hole.

## Non-goals

- Pricing by count, bundles or discounts.
- Repricing existing entries when a class's fee changes.
- A per-trial fee.
- Charging or refunding a difference online when a dog changes class (MYK9-1929 decided the club collects it).
