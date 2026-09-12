## ADDED Requirements

### Requirement: Show money state is derived once per show

For each show group the page SHALL derive exactly one money state from the orders it contains, using the same order-balance facts the cart and My Payments read (`getOrderOnlinePrompt`, `getOrderPayAtShowPrompt`, `MyEntryBalance`): `balance-due` when any order has a payable online balance and the show is not past; `pay-at-show` when no online balance is due and any order is to be paid by cash or check at the show; `settled` when every order is paid, waived, refunded, or partially refunded; `unresolved` when the show is past and an online balance remains. The amount shown for `balance-due` SHALL equal the sum the cart will charge for those orders.

#### Scenario: One unpaid order among paid ones

- **WHEN** a show has two paid orders and one with a $45 online balance
- **THEN** the show's money state is balance-due with amount $45

#### Scenario: Cash at show

- **WHEN** a show's only order is recorded as pay-at-show by check
- **THEN** the money state is pay-at-show and no balance-due strip renders

#### Scenario: Waived fee is settled

- **WHEN** a show's only order has its fee waived
- **THEN** the money state is settled

### Requirement: Money appears in the show meta line, and as a strip only when action is needed

The show header meta line SHALL carry a muted "✓ Paid" for `settled`, "Pay at show" for `pay-at-show`, and no money word for `balance-due` or `unresolved`. For `balance-due` the show group SHALL render exactly one warm strip above the dog cards stating which dog(s) the balance covers and the amount, with the existing Finish Payment link to the cart scoped to those orders. For `unresolved` the strip SHALL instead say to contact the club, with no link, matching today's past-show copy. No "Paid", "Payment Due", "Refunded" or "Partial Refund" chip SHALL render anywhere on the page.

#### Scenario: Settled show

- **WHEN** a show's money state is settled
- **THEN** the meta line reads "✓ Paid" and no strip renders

#### Scenario: Balance due

- **WHEN** a show's money state is balance-due for Scout's order at $45
- **THEN** one warm strip reads that Scout's entry is waiting on payment, $45 due, with a Finish Payment control whose href is the existing cart deep link for that order

#### Scenario: Past show with balance

- **WHEN** the show is past and an order still has an online balance
- **THEN** the strip says to contact the club and offers no payment control

### Requirement: Refunds are noted on the dog they touched

When an order carries a refund, the dog card(s) for that order SHALL show a muted note beneath the class rows: "Partial refund of <amount> issued <date>" or "Refunded <amount> on <date>". The note SHALL NOT render as a chip and SHALL NOT change the show's money word.

#### Scenario: Partial refund

- **WHEN** an order with one dog was partially refunded $15 on Oct 8
- **THEN** that dog's card shows "Partial refund of $15 issued Oct 8" and the show meta line still reads "✓ Paid"

### Requirement: Paid confirmation shows once, then retires

After an order becomes paid online, the show group SHALL render one green strip above the dog cards naming the dog(s), the amount, the payment date, and that a receipt was sent to the exhibitor's email, with a Dismiss control. The strip SHALL be keyed per order and SHALL NOT render again once dismissed, SHALL never render once the show's last date has passed, and SHALL NOT render when the payment is older than 14 days (so a new device does not greet the exhibitor with one strip per show they paid for long ago). The seen marker SHALL be stored device-locally through the same mechanism as `resultRevealSeen` (`localStorage`, guarded against unavailable storage), so a payment recorded while the exhibitor was elsewhere still confirms on their next visit from any device until dismissed there. Pay-at-show and waived orders SHALL NOT produce the strip.

#### Scenario: First visit after paying

- **WHEN** an order was paid online today and this device has not dismissed its confirmation
- **THEN** the show group shows the green strip with the dog, the amount and the date

#### Scenario: Dismissed

- **WHEN** the exhibitor activates Dismiss
- **THEN** the strip is removed and does not render on reload in the same browser

#### Scenario: Show date passed

- **WHEN** an order was paid but the show's last date is before today
- **THEN** no green strip renders even if it was never dismissed

#### Scenario: Old payment on a new device

- **WHEN** an order was paid online 30 days ago for a show still ahead and this device has never dismissed it
- **THEN** no green strip renders

#### Scenario: Storage unavailable

- **WHEN** localStorage throws
- **THEN** the strip still renders and Dismiss removes it for the current page load without an error

### Requirement: Orders and receipts open the existing receipt surface

The show header SHALL offer "Orders & receipts". For a show with one order it SHALL open the existing receipt dialog for that order directly. For a show with several orders it SHALL open the same dialog on a list of the show's orders (date, confirmation number, dogs, amount and payment state, refund rows under their order), each row opening that order's receipt. No new route, page or sheet SHALL be introduced; the My Payments "Receipt" deep link SHALL keep resolving to the same dialog.

#### Scenario: Single order

- **WHEN** a show has one order and the exhibitor activates Orders & receipts
- **THEN** the existing receipt dialog opens showing that order's receipt

#### Scenario: Several orders

- **WHEN** a show has three orders
- **THEN** Orders & receipts opens a list of three orders, and choosing one shows that order's receipt in the same dialog

#### Scenario: Deep link still lands

- **WHEN** My Shows is opened from a My Payments "Receipt" link carrying an order id
- **THEN** the receipt dialog opens for that order as it does today
