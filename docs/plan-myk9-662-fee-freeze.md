# MYK9-662 fee freeze and payment recovery

> **Status:** Active

## Invariant

Each entry has one fee in integer cents, fixed by a trusted server at the first chargeable boundary. A cart line is frozen when its Stripe Checkout Session is created; a staff or offline entry is frozen at submission; a payment link reads that submitted fee. The webhook, recovery, refund, and payout paths only read a frozen fee. A later birthday, show-fee edit, or day-of-show tier change cannot reprice an existing payment.

## Design

1. **Cart checkout.** Reuse the current server-authoritative price calculation before creating a Stripe Session. Persist a service-role-only snapshot keyed by Session ID with cart ID, each item ID/identity/handler/fee, subtotal, platform fee, and total. The checkout function records it before returning the URL; if persistence fails, expire the Session and fail. Reusing a Session requires its snapshot. The webhook loads the snapshot, checks its item identities against the cart and the fresh Stripe `amount_total`, then creates entries from its per-item fees. It does not read DOB or live show fees. Cart mutations still sever/expire the Session. A genuine mismatch triggers an idempotent make-whole refund and alert before the cart claim; transient snapshot/identity reads return 5xx so Stripe retries. A missing snapshot for an already paid Session is an incident, never a reason to trust client cart prices.
2. **Submitted entries.** `submit_show_entries` and the offline sync path set `entries.entry_fee` once from the server's handler and trial data. Typed handler names without a person ID have unknown age and receive the regular fee; persist that same null handler identity. Unpaid entries with missing fees are not silently converted to zero. Resolve legacy NULL values at one trusted boundary before offering a payment link, persist the resolved value once, and use the same value for cart recovery. Explicit zero remains a valid waived fee and must not create a zero-amount Stripe line.
3. **Co-owner authority.** A dog owner cannot attach an arbitrary person's ID as co-owner through a direct dog update or creation call. A new co-owner assignment requires a trusted staff operation or verified account ownership; preserve legitimate existing relationships. This closes both the fee oracle and access escalation at their source.
4. **Client scope.** Request an authoritative cart quote only when this show configures a junior fee. A quote failure keeps the cart editable and blocks only payment with a clear retry. Staff/offline submission defers collection only when a junior fee is configured and the chosen handler could qualify; an adult or unknown handler keeps the existing flow. If the replicated show row is missing the junior-fee field, treat it as unverified and defer the potentially junior fee until sync. The secretary notice links to the exact entries in Entries Management, which remains the single payment surface.

## Round 3 recovery design

1. **Classify before moving money.** A webhook read error is retryable. A paid session whose snapshot and cart disagree is refundable only after checking that this same payment has no order or entries. Cart expiry is judged at payment time using Stripe's Session, not at webhook delivery time. A later retry cannot turn a valid payment into an expiry refund.
2. **Recover an interrupted claim.** The cart claim is a lease, not proof of completed fulfillment. A redelivery for the same Session with no order or entries waits while the first worker may still be alive, then reclaims after the lease and resumes from the frozen snapshot. A different paid Session for a submitted cart is a duplicate charge and is refunded. Claim read/write failures throw so Stripe retries. Partial fulfillment is reconciled by payment intent before any refund, never mistaken for a fresh empty cart.
3. **Limit private age decisions.** Remove the unused read-only staff junior-fee quote RPCs; first-time entries are priced by the write-side submission RPC. The proposed handler must be the verified owner/co-owner or have an existing show relationship. An unrelated person ID is rejected before deriving junior status. Staff writes to `co_owner_id` use the dog's club/show authority, not a no-arg staff role. A missing caller person ID never grants ownership.
4. **Compatibility and release.** Snapshot-less Sessions created before the server deployment are handled explicitly; an open legacy Session is expired and replaced at checkout, while an already paid one is checked against Stripe's charged lines and the Session's unchanged cart before its snapshot is persisted. The quote response is versioned so an old checkout function cannot silently create a Session in quote mode. Deploy schema and both Stripe functions before the client.
5. **Refund and record lifecycle.** Recognize checkout auto-refunds in `charge.refunded`, treat an already refunded intent as successful on retry, and compare payment-link paid cents to the frozen entry fees before marking entries paid. Fee snapshots do not block authorized hard deletion and are deleted after seven years.

## Round 5 review design

1. **Paid cart claim.** The frozen snapshot and Stripe event-time expiry check decide whether payment is valid. The atomic claim accepts an `active` or `expired` cart still pointing to that Session; the status latch moves either to `submitted`. A paid, valid cart therefore cannot be stranded merely because the expiry worker ran before webhook delivery.
2. **Replication and offline pricing.** A stale replicated show with an absent junior-fee field must omit that column from update and conflict-replay payloads; an explicit null remains a deliberate clear. A queued offline entry with a NULL fee is priced by the server trigger for every show, using the configured junior rate only when positive and otherwise the regular fee. The offline client leaves payment pending until sync.
3. **Scope.** Only shows with a positive junior fee need the added staff handler relationship guard. Premium generation omits the junior fee for ASCA and narrows the untyped database value before comparing it.

## Self-review: recovery authorization

Finish Payment already offers existing entries to both dog owners and co-owners. Keep that same authorization at checkout and the legacy NULL-fee freeze RPC, with an explicit non-null caller requirement. Recovery reads the submitted handler and fee; it does not accept a replacement handler. The new-entry handler restriction stays at the submission boundary. Test co-owner recovery and unrelated/null callers, and verify the SQL authorization in the behavioral fixture.

The frozen cart line must also retain the handler used to calculate its price. Store `resolved_handler_id` beside the original cart `handler_id`: the original remains the cart-mutation comparison key, while the resolved value is written to the paid entry. This prevents a blank selection from pricing the owner but saving an unknown handler, and prevents later dog ownership edits from changing the paid handler. Older snapshots without the new field retain their original handler value.

Stale show rows must preserve the unknown junior fee through every mapping into an edit form, not only the final replication serializer. The show store records `juniorFeeKnown`, and both edit-form builders omit an unknown fee. Explicit blanks and zero remain intentional edits. Cover the store and both form builders before testing their existing save paths.

## Verification and release

- Add behavior tests for AKC birthday and UKC calendar-year boundaries, a failed quote with an editable cart, frozen-price webhook behavior after DOB/show-fee changes, retryable read failures, mismatch refunds, typed handlers, NULL/zero entry fees, co-owner writes, and scoped staff/offline deferral.
- Run focused tests red then green, full shuffled app suite, typecheck, lint, migration guard, formatting, and code-quality ratchet. SQL behavior tests run in CI because the development Mac has no container runtime.
- Deploy in order after the PR is eligible: schema, `stripe-checkout` and `stripe-webhook` together, payment-link function, then frontend. Keep the existing 31-minute Checkout Session lifetime in mind when switching webhook versions. No deployment or merge before October 10 without an explicit request.

## Scope

This corrects the existing PR's money path. It adds no fee-management page or second desk payment workflow. The existing Entries Management page remains the destination. The separate wizard preview issue MYK9-838 remains outside this correction unless needed to prevent an incorrect payable amount.

The mixed cash/check migration belongs with the fee freeze because a single staff submission can contain both adult and junior entries. Deferring the whole batch would discard the adult money receipt; splitting it into two submissions would leave a partial batch if the second call failed. One transaction prices every line, records only cash/check received for adult lines, and leaves junior lines due. Its ledger cascade patch must commit in the same migration transaction as the submission patch.
