# MYK9-879 controlled checkout rehearsal — November 1, 2026

source: codex. **Final result, November 3: four sandbox payments verified, cleanup passed, and both
Linear issues closed.** Pay also worked on a physical Android phone in Chrome. See the
[Android Chrome result and Linear closure](#november-3-android-chrome-result-and-linear-closure).

**Initial November 1 run:** Stopped at the cart identity and amount gate. The four wizard previews
passed, zero of four test payments ran, and cleanup passed. The run identified
[MYK9-1661](https://linear.app/myk9-platform/issue/MYK9-1661) as the blocker.

## Baseline, window and authorization

- Detecting task: nightly-commit-review follow-up; run `ab794b04`.
- Source baseline: `b1e71a70cbb0ef41d77087d51576a0477f5bd16d`.
- Served frontend: `03e1cd723eddbd8e09ae851a42be208f8aaf6c18`.
- Freshly fetched main: `33ad5c385154ed8c56baeeb75666d290f5d26ae9`; same cart handoff.
- Execution: November 1 America/Chicago; November 2, 00:02–00:25 UTC.
- Report path: `docs/qa/myk9-879-checkout-rehearsal-2026-11-01.md`.
- Scope: [owner-approved packet](https://linear.app/myk9-platform/issue/MYK9-879#comment-5a9ee79a-e294-4715-9d0d-ff9682fd3bbe),
  four test payments maximum, dedicated fixtures, isolated receipts and cleanup. Owner separately
  approved synthetic entry agreements. Only A's displayed AKC agreement was accepted; B/C displayed
  none and D was not submitted. No live charge, refund or application change authorized/performed.
- This follow-up reviews no new nightly commit range. Audit boundary
  `3f92928d9fec44c44c4a960fecd691f19929ba00` and retained daily report/cursor commit
  `a292a3d86bf9ef30bd88708e62983ff55e6c0630` are unchanged.

## P1 / High — new product defect

**NCR-2026-11-01-01 / [MYK9-1661](https://linear.app/myk9-platform/issue/MYK9-1661)**:
wizard Submit & pay opens another show's newer cart.

- Classification: product defect, cart navigation/context; status new; source codex.
- Canonical P1: the older show's registration needs a brittle recovery URL/workaround to reach its
  intended payment cart. No wrong charge or financial loss is claimed. Source label High.
- First/last seen November 1 Chicago; settled evidence `2026-11-02T00:18:46.543Z`; recurrence one run.
- Role/workflow: exhibitor with multiple saved show registrations, wizard → cart. Chrome for Testing
  at390×844. Desktop not replayed; shared route logic is not viewport-specific.
- Reproduction: prepare A's cart, then a newer populated D cart; restore A's Payment step, verify
  three classes/$85.60, accept its agreement and click Submit & pay once. Settled `/cart` shows D,
  one Cap class/$32.10 and a Pay button for that entry.
- Expected: A's identity, three intended lines and $85.60 survive the handoff and reload.
- Applied DB proof: A cart `7b55ee1b-f474-478d-87e6-aff01edefb85`, show
  `42f7e121-dfb1-4f13-90f9-91cb0cbc5fa1`, fees2000/3000/3000, flags true/false/false,
  subtotal8000/platform560/total8560. D cart `c76ebe4a-7148-481d-9eca-2778f35f16eb`, show
  `e47f6080-8998-4ee6-9565-d148b2249ee4`, one3000-cent line/platform210/total3210.
  A is stored correctly; hydration chooses D because its cart was created later.
- Cause: `apps/myk9show/src/features/registration/registrationCartCheckout.ts:109` navigates to bare
  `/cart`; `pages/CartPage.tsx:156,182–200` obtains show scope only from the URL and hydrates on mount;
  `store/cartStore.ts:185–193` delegates without a show filter;
  `store/cartStore.pickCart.ts:87–99,118–137` selects the newest active populated cart across shows.
- Impact/confidence: high confidence from repeated settled DOM, screenshots, DB cents/flags and code.
  Payment is offered for another saved show while the intended show remains unpaid. Stopped before Pay.
- Dedup: archived-inclusive workflow/route/file/symptom/cause queries; full MYK9-650 and509/comments
  read. Their completed cart-pick/draft-recovery scope stays Done. MYK9-1644 is unrelated test-only
  mutation work. No canonical duplicate. Related existing work: PR2618,2409,2246.
- Owner: Claude implements; no implementer claimed. Next action: preserve explicit show/cart context
  through the existing cart route and add a two-show regression. No fee arithmetic/new UI needed.
- Acceptance/closure: older-show handoff retains exact show/cart/dog/class identity, cents and flags;
  other cart unchanged; full reload,409 recovery, payment-link/cancel and generic `/cart` work.
  Focused regression must fail before/pass after the fix, including equal-amount carts. Then deployed
  browser/DB proof at phone and desktop on a named commit at/after the fix, followed by cleanup and a
  fresh full-issue read. A merge or unrelated tests do not close it. Full contract/screenshots in1661.

## P2 / verification — blocked existing contract

[MYK9-879](https://linear.app/myk9-platform/issue/MYK9-879) retains its historical implementation,
dates and High source priority. This run confirms a blocker to its outstanding acceptance, not a new
junior-fee charging defect. Operational/environment prerequisites were available; removed
needs:environment/needs:operator. verify:browser/checkout/database and blocker1661 remain.

| Case         | Observed wizard preview                                | Reached cart/paid proof                                |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| A AKC mixed  | Three classes; $96.30 → $85.60 when only Junior ticked | A DB fees/flags correct; UI switches to D; stopped     |
| B UKC junior | $32.10 → $21.40; January1 competition-year wording     | Preview only, declaration not submitted                |
| C ASCA       | No junior control; $32.10                              | Preview only; stale-declaration mutation not performed |
| D AKC cap    | Tier40/normal30; ticked preview still $32.10           | Preview only; agreement/submission not performed       |

**Zero Checkout Sessions, payments, entries, orders, receipts or refunds.** No completed-payment
webhook/replay, charged fee/declaration, receipt delivery, secretary badge or outsider paid-record
visibility proof was reached. Secretary desktop proof was not run. All remain owed in879.

## Environment and artifact evidence

Actual Stripe UI verified myK9Show dev Sandbox `acct_1TgaIlAIej2Q9UtX` and mapped connected account
`acct_1UX2MTA9DxyaABXF`, active Payments/Payouts, STRIPE TEST BANK. Existing demo club
`73406ba3-e675-4e16-9799-489e75a3bc43` and mapping unchanged. DB modefalse, service fee7%, flat/min0.

Actual deployed checkout v84/webhook v105 downloaded and inspected, not inferred from local source.
ESZIP SHA256:

- checkout: `d53fc680ba26a2994c1e6149230a5384bce76f4dc9cccbecabe5bd74fb191217`
- webhook: `67133c4a271a20eb2358ea9d73a8f1e1facfe8c3f1b891ac3d39df7158db259d`
- Both authoritativeFee: `4bbd99454c327f79dcabbb81b53035919aeecc34a1dbdda16308aca7428076ca`
- Both cartItemPricing: `b7f1393f26703870ef833fa5d8eaeafc0b189d9896b652213d8faf30921acd33`

Actual modules retain junior min cap/ASCA exclusion and frozen-fee paths. Receipt source is payer-scoped
and idempotent. Source inspection is not charged-amount or delivery proof.

## Checks and verification limits

- Pricing/declaration suite:3files/43tests PASS, exit0, before rehearsal.
- Existing cart handoff/pick/hydration suite:3files/22tests PASS, exit0,1.80s.
- verifier gap: registrationCartCheckout.test.ts:55/118 asserts bare `/cart` and mocks navigation;
  hydration tests do not compose an older wizard submit with a newer populated show cart.1661 owns
  the two-show regression, including equal-amount identity assertions.
- Initial unsupported actor onboarded_roles value was corrected after reading the applied constraint,
  using the same synthetic fixture. Browser selector/timing errors were corrected before settled
  preview proof. These are harness events, not additional product defects.
- No application code/test edit, fix, PR, deployment, commit, push or nightly cursor advance.
- Fixes found in subsequent commits: none for1661; current main checked. No finding resolved by merge.

## Cleanup and readback

Final independent readback `2026-11-02T00:24:53.323Z`: PASS.

- Four own shows draft, online entries disabled; all24 own lifecycle email steps disabled.
- Four own unpaid carts abandoned, all session IDs NULL. Zero holds/leases, including active.
- Own scoped secretary grant inactive; three new test accounts banned, zero remaining auth sessions.
- Retained dormant synthetic graph:3people/profiles/accounts,4shows/trials,6classes/dogs/registrations,
  4unpaid carts/6lines and default exhibitor roles. No permanent deletion or money-column rewrite.
- All pre-existing row fingerprints unchanged across14 fixture/accounting/subscription tables.
  New additions match the manifest. No changes to prior MYK9-639 fixtures/club/mapping, refunds,
  notifications or push subscriptions.
- Unique browser `myk9-879-1101` closed through its own foreground controller, exit0. Final CLI
  inventory has no open owned session. No blanket browser cleanup.

## Counts, tracking and next proof

New1(P1 product defect1661); unchanged0; resolved0; duplicate0; rejected0; blocked1(existing879
verification contract). No P0/P3 findings. Created1661; reconciled879 with full result comment
[005b7301-a063-45ea-86c1-986a237f39db](https://linear.app/myk9-platform/issue/MYK9-879#comment-005b7301-a063-45ea-86c1-986a237f39db).

Claude fixes1661 and proves deployed cart identity, then879's four-payment matrix can resume within
its approved limits and dedicated-fixture safeguards. MYK9-879 closure still requires exact charged
amounts/declarations, webhook/accounting/receipt evidence, secretary UI and negative controls, cleanup
and a fresh full-issue read. No new owner decision is needed to record this result.

## November 3 rerun — stopped before fixture activation

**NOT RUN — November 3, 2026 rerun.** The owner approval on MYK9-879 was read first. Production served `6db0887c8aec81623df6c9344ec17f27175dd88e` (contains #3549, #3575, #3576). The credential handoff had blank password fields for the three dedicated actors; the prior manifest's passwords were scrubbed. Stopped before sign-in or fixture activation.

Preflight PASS: DB reported `stripe_livemode=false`, fees 7% + 0¢ flat, 0¢ minimum, and the expected test-mode mapping `acct_1UX2MTA9DxyaABXF`. Checkout v84 and webhook v105 artifacts match the hashes from the original rehearsal. No per-session Stripe checks were reached.

Original run `ab794b04` fixture IDs and expected amounts (cents, not observed charges):

| Case             | Show ID                                | Original cart ID                       | Subtotal + fee = total |
| ---------------- | -------------------------------------- | -------------------------------------- | ---------------------: |
| A AKC mixed      | `42f7e121-dfb1-4f13-90f9-91cb0cbc5fa1` | `7b55ee1b-f474-478d-87e6-aff01edefb85` |      8000 + 560 = 8560 |
| B UKC junior     | `bc05a361-2807-4ae0-9c0d-465a909dfac7` | `271eb314-be4f-4664-b9e3-3b28ba91bec7` |      2000 + 140 = 2140 |
| C ASCA           | `4c29789c-5485-4a57-ba86-5cb6e86834aa` | `713403ef-aa13-4c26-9b7b-d2997b5b0834` |      3000 + 210 = 3210 |
| D AKC junior cap | `e47f6080-8998-4ee6-9565-d148b2249ee4` | `c76ebe4a-7148-481d-9eca-2778f35f16eb` |      3000 + 210 = 3210 |

| Case | Wizard preview | Cart total | Stripe amount | Webhook | Orders/entries fees & flags | Receipt | Secretary desktop | Outsider denial |
| ---- | -------------- | ---------- | ------------- | ------- | --------------------------- | ------- | ----------------- | --------------- |
| A    | NOT RUN        | NOT RUN    | NOT RUN       | NOT RUN | NOT RUN                     | NOT RUN | NOT RUN           | NOT RUN         |
| B    | NOT RUN        | NOT RUN    | NOT RUN       | NOT RUN | NOT RUN                     | NOT RUN | NOT RUN           | NOT RUN         |
| C    | NOT RUN        | NOT RUN    | NOT RUN       | NOT RUN | NOT RUN                     | NOT RUN | NOT RUN           | NOT RUN         |
| D    | NOT RUN        | NOT RUN    | NOT RUN       | NOT RUN | NOT RUN                     | NOT RUN | NOT RUN           | NOT RUN         |

No new Checkout Session, payment, order, entry, refund, or receipt IDs. Historical cart totals are not rerun evidence.

- MYK9-1673: **NOT RUN — 390×844 and desktop.** The dedicated payer password was missing from the handoff. No Stripe session was created, so neither the actual `cancel_url` nor the cross-tab **Return to Your Entry** destination was observed. Expected: checkout for A `42f7e121-dfb1-4f13-90f9-91cb0cbc5fa1` returns to A after opening D `e47f6080-8998-4ee6-9565-d148b2249ee4` in a second tab. Existing evidence on this issue is unchanged.
- MYK9-1661: **NOT RUN — 390×844 and desktop.** The dedicated payer password was missing from the handoff. Neither the cross-tab Stripe cancel return nor A’s wizard **Submit & pay** with newer D was replayed on this build. Expected: A `42f7e121-dfb1-4f13-90f9-91cb0cbc5fa1`, three lines and 8560¢, instead of newer D `e47f6080-8998-4ee6-9565-d148b2249ee4`, one line and 3210¢. Prior wizard evidence on `ea2ef70d` remains separate.

**Cleanup PASS — independent DB readback at 12:02:24 p.m. CST.** The four shows stayed draft with online entries off; 24/24 lifecycle steps stayed disabled; grant `f3f2c01e-e5e1-4dea-bed1-6f903bfe6297` stayed inactive. All six fixture carts (four original plus the two from the earlier MYK9-1661 replay) stayed abandoned with no linked Sessions. Holds, leases, and auth sessions: 0. The payer `ed1e37a5-a444-4b94-8318-4ce1f45a142f`, secretary `82ed3c2a-dabf-4bc4-8c96-cbd4aedb7a78`, and outsider `ba3ff155-2064-437b-9651-49599f54696e` went from unbanned to banned. All 1,015 fingerprints across the 14 tracked public tables matched the preflight. No Playwright session was opened.

[Linear run record](https://linear.app/myk9-platform/issue/MYK9-879#comment-6d423c5b-2fae-497e-877d-36f662537b26). No issue state changes.

## November 3 resume — both regressions passed; stopped before payment

November 3 resumed rehearsal on production `6db0887c8aec81623df6c9344ec17f27175dd88e` with run `ab794b04` fixtures and the owner’s recorded approval. Four original carts reopened and four shows went from draft/off to published/on; secretary grant activated; no lifecycle emails needed. Stripe sandbox `acct_1TgaIlAIej2Q9UtX`, test mapping `acct_1UX2MTA9DxyaABXF`, 7% + 0¢ flat, 0¢ minimum. **One unpaid sandbox session; zero of four payments.** Automatic approval review rejected submitting even a sandbox payment and required a user handoff. The owner chose to stop and clean up.

| Case             | Wizard preview                                                                                              | Cart total / line cents                                                         | Stripe Checkout                                                                     | Webhook | Orders / entries | Receipt | Secretary desktop | Outsider |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------- | ---------------- | ------- | ----------------- | -------- |
| A AKC mixed      | PASS: 9630→8560¢, junior only                                                                               | PASS: 8560¢; 2000 true / 3000 false / 3000 false                                | PASS: USD 8560¢, `livemode=false`; Stripe lines 3000/3000/2000/560¢; expired unpaid | NOT RUN | NOT RUN          | NOT RUN | NOT RUN           | NOT RUN  |
| B UKC junior     | NOT RUN to a settled result: harness timed out; expected 2140¢                                              | NOT RUN to a settled result; expected 2000+140¢                                 | NOT RUN                                                                             | NOT RUN | NOT RUN          | NOT RUN | NOT RUN           | NOT RUN  |
| C ASCA           | NOT RUN to a settled result: capture returned to Classes with no selections; expected 3210¢, no declaration | NOT RUN to a settled result; expected 3000+210¢; stale declaration not injected | NOT RUN                                                                             | NOT RUN | NOT RUN          | NOT RUN | NOT RUN           | NOT RUN  |
| D AKC junior cap | PASS: 3210¢ with declaration selected, unchanged from unticked                                              | PASS: 3210¢; 3000¢/true + 210¢                                                  | NOT RUN                                                                             | NOT RUN | NOT RUN          | NOT RUN | NOT RUN           | NOT RUN  |

NOT RUN payment-dependent checks: no Pay click was executed. B/C original carts ended abandoned with 0¢ after the incomplete wizard attempts; no product verdict assigned to either attempt. B show/cart: `bc05a361-2807-4ae0-9c0d-465a909dfac7` / `271eb314-be4f-4664-b9e3-3b28ba91bec7`; C: `4c29789c-5485-4a57-ba86-5cb6e86834aa` / `713403ef-aa13-4c26-9b7b-d2997b5b0834`.

**PASS — Stripe cancel return at 390×844 and 1280×900.** Checkout was for A (`42f7e121-dfb1-4f13-90f9-91cb0cbc5fa1`, cart `7b55ee1b-f474-478d-87e6-aff01edefb85`); before clicking Stripe’s **Back to myK9Show dev**, a second tab loaded D (`e47f6080-8998-4ee6-9565-d148b2249ee4`, cart `c76ebe4a-7148-481d-9eca-2778f35f16eb`) at 3210¢ and its cart ID was verified in shared recovery storage. Stripe’s actual `cancel_url` included `show=42f7e121-dfb1-4f13-90f9-91cb0cbc5fa1`. Both cold returns landed on the cancel page carrying A, and **Return to Your Entry** opened A’s scoped cart at 8560¢. Both viewports reused sandbox session `cs_test_b1wCC2kxYqxj2GrnkjMBa5MmJKxQ2Bu0NGs5UIjEIDMmjYIyHqxPazg3wm`; no additional session was opened.

**PASS — wizard handoff at 390×844 and 1280×900.** D (`c76ebe4a-7148-481d-9eca-2778f35f16eb`, created 2026-11-02 00:16:45 UTC) was newer and populated at 3210¢; A (`7b55ee1b-f474-478d-87e6-aff01edefb85`, created 00:06:17 UTC) was older. A's **Submit & pay** opened `/cart?showId=42f7e121-dfb1-4f13-90f9-91cb0cbc5fa1` at both sizes, with 8000¢ entry subtotal + 560¢ fee = 8560¢. A’s line fees/declarations were 2000¢/true, 3000¢/false, 3000¢/false; D's was 3000¢/true. Ran wizard before opening Stripe to keep the four-session cap; a resubmit while a Checkout Session is linked can abandon the original cart.

**Cleanup verified at 12:29:13 p.m. CST.** Stripe confirmed A’s only Session expired, unpaid, and `livemode=false`. All four shows returned to draft with online entries off; all 24 lifecycle steps stayed disabled; grant `f3f2c01e-e5e1-4dea-bed1-6f903bfe6297` is inactive. All six scoped carts (including the two historical A/D carts) are abandoned and unlinked. Zero active holds and zero leases; three released hold rows are retained as history. All three actors re-banned, zero auth sessions. Across 14 tracked tables, 1010 non-fixture row fingerprints matched, no rows were added, and the five changed fingerprints were the four synthetic shows and the synthetic payer profile. Playwright `myk9-879-1103-cd2616` closed; Stripe Workbench tab closed. No live sessions, refunds, payments, orders, entries, or real-recipient email.

[Linear run record](https://linear.app/myk9-platform/issue/MYK9-879#comment-4f20c8fb-17bf-40c3-899a-52b1be31a2c7). No issue states changed.

## November 3 manual handoff — four sandbox payments verified

**PASS — November 3 manual sandbox rehearsal.** Four owner-submitted payments, one open Checkout Session at a time, on production build `6db0887c8aec81623df6c9344ec17f27175dd88e`, using the original `ab794b04` fixture graph. Stripe verified the expected amount and sandbox mode before each handoff and confirmed all four settled. Total 17120¢ USD across four succeeded orders and six paid entries.

| Case                     | Wizard preview                                                      | Cart subtotal + fee |  Stripe paid | Webhook and paid entries (cents/declaration) | Receipt                                  | Secretary, 1280×900                 | Outsider                  |
| ------------------------ | ------------------------------------------------------------------- | ------------------: | -----------: | -------------------------------------------- | ---------------------------------------- | ----------------------------------- | ------------------------- |
| A AKC mixed              | PASS — 9630¢ → 8560¢, junior only (same-build prior replay)         |  PASS — 8000 + 560¢ | PASS — 8560¢ | PASS — 3000¢/false, 3000¢/false, 2000¢/true  | PASS — confirmation screen and delivered | PASS — Paid online, 1 junior badge  | PASS — 0 orders/0 entries |
| B UKC junior             | PASS — 3210¢ → 2140¢, January 1 UKC wording                         |  PASS — 2000 + 140¢ | PASS — 2140¢ | PASS — 2000¢/true                            | PASS — confirmation screen and delivered | PASS — Paid online, 1 junior badge  | PASS — 0 orders/0 entries |
| C ASCA stale declaration | PASS — 3210¢, no junior control                                     |  PASS — 3000 + 210¢ | PASS — 3210¢ | PASS — 3000¢/false                           | PASS — confirmation screen and delivered | PASS — Paid online, 0 junior badges | PASS — 0 orders/0 entries |
| D AKC junior cap         | PASS — 3210¢ with and without declaration (same-build prior replay) |  PASS — 3000 + 210¢ | PASS — 3210¢ | PASS — 3000¢/true                            | PASS — confirmation screen and delivered | PASS — Paid online, 1 junior badge  | PASS — 0 orders/0 entries |

The C control set the original ASCA cart line’s stale declaration to true while preserving 3000¢. Stripe still charged 3210¢, and the webhook wrote the paid entry with declaration false. D retained declaration true and charged 3000¢ for the entry despite its 4000¢ junior tier. All six entries had `card_paid=true`, no secretary override, and a receipt stamp. All four receipt IDs matched delivered logs for the synthetic sink. No refund requests or refunded cents were recorded. The earlier two-viewport cancel-return and wizard identity results remain in their existing evidence comments.

- **A** — show `42f7e121-dfb1-4f13-90f9-91cb0cbc5fa1`, cart `7b55ee1b-f474-478d-87e6-aff01edefb85`, order `bc3aa0dc-23e5-48b3-ab1b-e3e7f8fa82be`, Checkout `cs_test_b1lX8YGPEQ4dud0IpjxnrTvmOVVXXJ1DdIhZS0X4HpINyn9ECOBXUqJ93G`, PaymentIntent `pi_3UXo9OAIej2Q9UtX2gAwvzmp`, entry IDs `de3fa08b-8452-42ad-a0aa-04d66eb4766e` (3000¢/false), `48a380a5-53c6-4f0e-86a4-f2257a9a51a2` (3000¢/false), `ef52d3cb-f676-4d60-af07-95c8d33062e9` (2000¢/true), receipt `01a1a30f-a7f1-7350-b677-e96db1b5c436`, fulfillment completed `2026-11-03T20:17:52.95061+00:00`.
- **B** — show `bc05a361-2807-4ae0-9c0d-465a909dfac7`, cart `271eb314-be4f-4664-b9e3-3b28ba91bec7`, order `d6c83554-6308-43cf-acb3-b13b0aa45cf3`, Checkout `cs_test_b1pqkioClhh9P14WLbFNfmrhx3vt8D1eQvRxUp7zpq9BbrwfDiKbJlzUrW`, PaymentIntent `pi_3UXoBvAIej2Q9UtX3NRC9obX`, entry IDs `a025f6c3-993e-49be-b84c-02fa6f3615eb` (2000¢/true), receipt `01a1a312-0490-7582-8775-c1bb964a4875`, fulfillment completed `2026-11-03T20:20:28.430984+00:00`.
- **C** — show `4c29789c-5485-4a57-ba86-5cb6e86834aa`, cart `713403ef-aa13-4c26-9b7b-d2997b5b0834`, order `8028cadb-f149-4b96-9421-dbd013b33727`, Checkout `cs_test_b1IQc8b5aRWHYQmMmTFQBYeqoJgf6IJAOAqDqRGASfzrcC0XGZdZivoenx`, PaymentIntent `pi_3UXoGLAIej2Q9UtX2xu79HHa`, entry IDs `05e47562-6bfb-44c2-958d-b01f9212f232` (3000¢/false), receipt `01a1a316-35a1-79f6-91b6-7af952a6b1df`, fulfillment completed `2026-11-03T20:25:02.669607+00:00`.
- **D** — show `e47f6080-8998-4ee6-9565-d148b2249ee4`, cart `c76ebe4a-7148-481d-9eca-2778f35f16eb`, order `a92a8569-6664-4328-9c82-81637227d97b`, Checkout `cs_test_b187guU89LJvCKONZMstVcV2gn3XFeF0ucU9wWTWMuTo8Y72pjAlnXnJfN`, PaymentIntent `pi_3UXoJVAIej2Q9UtX32lGoqBX`, entry IDs `8cb67adc-bcb3-4f5a-a2a8-d91f68d1c1b3` (3000¢/true), receipt `01a1a319-2dda-7737-b404-7b9768f936f8`, fulfillment completed `2026-11-03T20:28:17.55056+00:00`.

**Cleanup verified at 2:30:08 p.m. CST.** All four shows are draft with online entries off, 24/24 lifecycle steps are disabled, and grant `f3f2c01e-e5e1-4dea-bed1-6f903bfe6297` is inactive. Payer `ed1e37a5-a444-4b94-8318-4ce1f45a142f`, secretary `82ed3c2a-dabf-4bc4-8c96-cbd4aedb7a78`, and outsider `ba3ff155-2064-437b-9651-49599f54696e` are re-banned with zero auth sessions. There are zero active carts, holds, and leases. The four submitted carts and six paid entries remain linked to the sandbox accounting records. Nine released hold rows remain as history, including three from the earlier run. The two historical carts remain abandoned. Of 1015 baseline rows across 14 tracked tables, only the four synthetic show fingerprints changed, and the only additions in those tables were the four expected orders. The named Playwright session and Stripe verification tab closed, and the temporary credential was removed.

Operator note — A’s Pay button was clipped by the phone-sized test viewport inside the desktop window. Resizing the existing checkout exposed Pay while preserving the entered card data. A physical phone was not used for the manual payment.

[Linear evidence](https://linear.app/myk9-platform/issue/MYK9-879#comment-d9e6fc75-681c-497f-a559-715611a53a5e).

## November 3 Android Chrome result and Linear closure

**PASS.** The owner opened Stripe Checkout by scanning a QR code on a physical Android phone in
Chrome, reached **Pay**, completed the $85.60 test payment, and reported a successful redirect.
Stripe confirmed the session was paid and complete in Sandbox mode (`livemode=false`).
[Android Chrome evidence](https://linear.app/myk9-platform/issue/MYK9-879#comment-487e274f-fb58-4931-905c-00c74b3d7119).

The phone check used a standalone Stripe session with case A’s sandbox customer and item amounts.
It covered the hosted Pay button and Stripe redirect. The four-payment rehearsal above covers the
myK9Show cart, webhook, and fulfillment. The temporary QR code was removed, and the completed
session remains as sandbox history. Database readback matched all 1,019 baseline fingerprints
across 14 tracked tables. The app retained four rehearsal orders and six entries. All three
synthetic accounts remained banned with zero auth sessions.

- **MYK9-1661 — Done.** The cart handoff and Stripe cancel return opened the correct cart at both
  tested viewport sizes, and the focused regression covered equal and different totals.
  [Linear closure](https://linear.app/myk9-platform/issue/MYK9-1661#comment-f24006a5-dc60-48a0-9bbc-e93cd687fb0b).
- **MYK9-879 — Done.** All four sandbox charges matched the wizard previews. Paid entry fees and
  declaration flags matched expectations, the PR checklist and behavioral SQL test were verified,
  and both blockers were closed.
  [Linear closure](https://linear.app/myk9-platform/issue/MYK9-879#comment-04ef52da-f10f-4d00-b9d7-b219f58f29bf).
