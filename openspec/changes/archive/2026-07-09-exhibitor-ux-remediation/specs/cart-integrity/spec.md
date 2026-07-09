# cart-integrity

## ADDED Requirements

### Requirement: Cart cannot pay into a closed show
When a cart item's target show has passed its entries-close time (evaluated in the trial's timezone), the cart SHALL disable the pay/confirm action for that item and explain why. The entry-submission path SHALL reject submissions for closed shows server-side.

#### Scenario: Entries closed before checkout
- **WHEN** an exhibitor opens a cart containing an entry for a show whose entries-close time has passed
- **THEN** the pay/confirm action is disabled (or the item is marked expired) with an explanation, and no payment can be initiated for that item

#### Scenario: Stale client attempts submission
- **WHEN** a submission for a closed show reaches the server (e.g. from a stale tab)
- **THEN** the server rejects it and no entry or charge is created

### Requirement: Cart items expire at entries-close
Cart items whose target show's entries have closed SHALL be treated as expired on cart load: removed or visibly marked expired with an explanation, and excluded from the payable total.

#### Scenario: Week-old draft entry
- **WHEN** an exhibitor returns to a cart drafted before entries closed
- **THEN** the expired item is not silently payable and the cart explains what happened

### Requirement: Non-empty cart is discoverable
Whenever the exhibitor's cart contains at least one active item, the exhibitor UI SHALL display a visible cart affordance (badge or link) reachable from the exhibitor's persistent navigation.

#### Scenario: Draft entry left in cart
- **WHEN** an exhibitor has an active cart item and is anywhere in the exhibitor surface
- **THEN** a cart indicator is visible and navigates to /cart
