# Wait List & Mail-In Reservation Design

## Capacity Model

Judge workload drives capacity. A judge can judge about 125 entries per day. This cap applies to **all classes assigned to that judge on a given show day**, regardless of which trial they belong to.

**Calculation:** Sum confirmed entries (statuses: `submitted`, `paid`, `confirmed`, `checked-in`, `competing`) across all classes for Judge X on Date Y. Subtract mail-in reservations. The remainder is available for online registration.

**Default:** 125 per judge-day, configurable per show. Individual judge-day assignments can override the show default.

**No per-class limits.** If one class attracts 80 entries and another gets 10, that's fine as long as the judge's daily total stays under the cap.

**Class rebalancing:** Secretaries can reassign classes between judges at any time. The system recalculates both judges' capacity and notifies the secretary if wait-listed entries now have room under the receiving judge.

---

## Mail-In Reservations

The secretary chooses a reservation strategy per show during setup:

| Strategy | Config | Example |
|----------|--------|---------|
| Fixed count | Number of spots | "Reserve 20 spots per judge-day" |
| Percentage | Percent of capacity | "Reserve 15% of each judge-day" |
| Deadline | Priority cutoff date | "Mail-in priority until March 15" |
| None | — | No reservations |

**Releasing reserved spots** — secretary picks one per show:

- **Auto-release on a date.** Secretary sets a release date. When it passes, unused spots open and the secretary is notified.
- **Manual release.** Spots stay held until the secretary explicitly opens them.

Mail-in entries are entered by the secretary (from physical forms). They count against the reserved pool first. If reserved spots run out, mail-in entries compete with online entries for remaining capacity.

---

## Exhibitor Experience

### Registration Flow

The cart handles everything. When checking out with entries across multiple classes:

- Classes with available capacity → normal entries (`submitted` status)
- Classes where the judge-day is full → wait list entries, automatically

The exhibitor sees clear messaging at checkout: "2 entries confirmed, 1 added to wait list (position #4 for Novice A)." No separate flow, no second checkout. No payment for wait-listed entries.

### Wait List Visibility

- Exhibitors see their position: "You are #4"
- They can withdraw from the wait list at any time

### Promotion Flow

1. Secretary promotes the exhibitor from the wait list.
2. Entry moves to `pending-payment`.
3. Exhibitor receives a push notification **and** an email: "You've been promoted off the wait list for [Class] at [Show]! Complete payment within [X] hours."
4. Exhibitor opens myK9Show, clicks "Complete Payment," goes through Stripe checkout.
5. Entry moves to `paid` → `confirmed`.

If the exhibitor doesn't pay within the deadline, the entry moves to `promotion-expired`. The secretary is notified and can promote the next person.

**Payment deadline** is configurable per show (default 48 hours). A reminder notification goes out at the halfway mark.

---

## Secretary Experience

### Dashboard

**Judge-day capacity overview** — each judge shows: assigned classes, confirmed entries, wait-listed entries, mail-in reserved spots, remaining capacity. At a glance, the secretary sees who's full and who has room.

**Wait list queue per judge** — ordered by submission time (FIFO). Shows exhibitor name, dog, class, position, and date added.

**Pending payments** — entries promoted but awaiting payment, with countdown timers.

### Actions

| Action | Effect |
|--------|--------|
| Promote | Moves wait-listed entry to `pending-payment`, triggers notification + email |
| Bulk promote | Promote multiple entries at once (e.g., after rebalancing) |
| Rebalance | Reassign a class between judges; system recalculates both capacities |
| Release reserved spots | Manually open unused mail-in reservations |
| Remove from wait list | Drop an entry from the queue (exhibitor notified) |

### Notifications to Secretary

- "Judge Smith is at 120/125 entries for Saturday."
- "[Exhibitor] completed payment for [Class]."
- "[Exhibitor] didn't complete payment for [Class]. Spot available."
- "[X] unused mail-in spots released for [Show]."

---

## Data Model Changes

### Existing schema (already in place)

- `waitlist_entries` table with position tracking (migration 009)
- `classes.allow_waitlist` and `classes.max_entries`
- `check_class_availability()` function
- Entry status lifecycle

### New columns on `shows`

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `default_judge_day_capacity` | INTEGER | 125 | Default max entries per judge per day |
| `mail_in_strategy` | ENUM (`fixed`, `percentage`, `deadline`, `none`) | `none` | How mail-in spots are reserved |
| `mail_in_value` | INTEGER | null | Count or percentage (depending on strategy) |
| `mail_in_deadline` | DATE | null | Cutoff date for deadline strategy |
| `mail_in_auto_release` | BOOLEAN | false | Auto-release unused spots |
| `mail_in_release_date` | DATE | null | When to auto-release |
| `waitlist_payment_deadline_hours` | INTEGER | 48 | Hours exhibitor has to pay after promotion |

### New column on `judge_assignments`

| Column | Type | Purpose |
|--------|------|---------|
| `day_capacity_override` | INTEGER (nullable) | Overrides show default for this judge-day |

### New entry statuses

| Status | Meaning |
|--------|---------|
| `pending-payment` | Promoted from wait list, awaiting Stripe checkout |
| `promotion-expired` | Didn't pay within deadline |

### New database function

`get_judge_day_capacity(judge_id, show_date)` — returns total confirmed entries, remaining capacity, and wait list count across all classes for that judge on that day.

---

## Notifications & Email

### New edge function: `push-trigger-waitlist`

| Event | Recipient | Channel |
|-------|-----------|---------|
| Promoted from wait list | Exhibitor | Push + Email |
| Payment deadline warning (halfway) | Exhibitor | Push + Email |
| Payment completed | Secretary | Push |
| Payment deadline expired | Secretary | Push |
| Judge approaching capacity | Secretary | Push |
| Mail-in spots auto-released | Secretary | Push |
| Removed from wait list | Exhibitor | Push + Email |

The promotion email includes a direct link to the payment page.

---

## Edge Cases & Rules

**Exhibitor withdraws a confirmed entry.** Spot opens. Secretary is notified. No auto-promotion — secretary decides who gets it.

**Secretary rebalances classes between judges.** Both judges' capacities recalculate. Confirmed entries are never bumped, even if the receiving judge goes over capacity. If the source judge now has room, secretary is notified about their wait list.

**Multiple classes share a judge-day budget.** An entry in any class counts against the same pool. Registration checks judge-day capacity, not per-class.

**Exhibitor is wait-listed and enters another class under the same full judge.** Allowed. Each entry gets its own wait list position.

**Show day arrives with entries still on wait list.** Secretary can bulk-notify remaining exhibitors, or let entries expire when the show ends.

**Promoted exhibitor's payment fails.** Treated like deadline expiry. Secretary is notified and can re-promote or move to the next person.

### Standing Rules

- Wait list order is strictly FIFO by submission time.
- No one gets bumped from a confirmed entry.
- Secretary is always the decision-maker for promotions.
- Payment is collected only after promotion, never before.
