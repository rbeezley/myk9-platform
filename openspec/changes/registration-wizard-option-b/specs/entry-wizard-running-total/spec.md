## Purpose

Keeps the cost of the entry visible while the exhibitor builds it, itemised by dog and trial day, so the total is never a surprise found at the bottom of the page or on the payment step.

## ADDED Requirements

### Requirement: The entry summary is visible on every pre-receipt step

On the dog-selection, class-selection, handler (staff) and payment steps the wizard SHALL present an entry summary that stays in view while the step content scrolls. The summary SHALL list, for each selected dog, each chosen class with its trial day and level and its fee, and SHALL show the entry-fee total. A selected dog with no classes yet SHALL be listed with a plain-language "no classes yet" line. The previous bottom-of-page per-dog and overall totals on the class-selection step SHALL NOT be rendered in addition to the summary.

#### Scenario: Class added while the list is scrolled

- **WHEN** the exhibitor has scrolled the class list and adds a class for a dog
- **THEN** the summary, still in view, gains that class under that dog and the entry-fee total increases by the class fee without the page scrolling

#### Scenario: Dog selected before any class

- **WHEN** two dogs are selected on the dog-selection step
- **THEN** the summary lists both dogs with "no classes yet" and an entry-fee total of $0.00

#### Scenario: Only one place shows the total

- **WHEN** the class-selection step renders with items in the cart
- **THEN** the entry-fee total appears in the summary and nowhere else on the step

### Requirement: The summary shows only entry fees before payment

Before the payment step the summary SHALL show entry fees only and SHALL state that any service fee is shown at payment and applies only to card. On the payment step the summary SHALL add the subtotal, the service-fee line when the selected method is card, and the amount due, using the same arithmetic as the existing payment summary so both cannot disagree.

#### Scenario: Card selected on payment

- **WHEN** the payment step renders with card selected and $200.00 of entry fees
- **THEN** the summary shows Subtotal $200.00, a service-fee line, and Total due equal to subtotal plus service fee as computed by the existing fee helper

#### Scenario: Check selected on payment

- **WHEN** the payment method is changed to check
- **THEN** the service-fee line is absent and Total due equals the subtotal

### Requirement: At phone width the summary becomes a bottom bar

At widths below the desktop breakpoint (1024px) the summary SHALL collapse to a bar fixed to the bottom of the viewport showing the class count and entry-fee total, with a control that expands the itemised list in place and the step's Back and Next controls in the same bar. The bar SHALL NOT overlap the last interactive element of the step content.

#### Scenario: Phone class selection

- **WHEN** the class-selection step renders at 390px with 5 classes in the cart
- **THEN** a bottom bar reads `5 classes · $125.00` with a Details control and the Back and Next controls, and expanding Details lists the classes per dog
