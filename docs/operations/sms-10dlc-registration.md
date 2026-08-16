# SMS Provider & 10DLC Registration

> **Status:** Active

Everything needed to get myK9Show legally able to send one SMS: the pre-run
ring alert (plan L6). Two separate things live here — **choosing a provider**
(a decision, reversible) and **A2P 10DLC registration** (a filing with the US
carriers, asynchronous, and a hard gate on launch).

**Start the registration before the send code is finished.** Campaign approval
is wall-clock time you cannot compress by working harder, and nothing can be
sent to a US mobile number until it clears. Everything in this document except
§3 is the operator's to do — it needs a legal business identity and a tax ID,
which no agent can supply.

---

## 1. Provider: use Twilio

Not because it is cheapest — it is the most expensive of the realistic options
— but because of one specific property that matters more than the price
difference at this volume.

**Twilio's Messaging Service enforces STOP/HELP/UNSTOP at the platform layer.**
Once a number replies STOP, Twilio blocks every subsequent send to it and
auto-replies, whether or not our own opt-out handling works. That converts the
highest-legal-risk part of L6 — "a bug in our STOP handler keeps texting
someone who opted out" — from a TCPA exposure ($500–$1,500 per message,
per recipient) into a logged delivery error. We still record opt-out in
`notification_preferences.sms_opt_out_at` via the inbound webhook so our own
send path knows, but Twilio is the backstop underneath that. Nothing we build
gets that guarantee for free.

The price delta is not material here. One alert per exhibitor per trial:

|                          | Twilio   | Telnyx / Plivo                      |
| ------------------------ | -------- | ----------------------------------- |
| Per outbound SMS         | ~$0.0079 | ~$0.004–0.005                       |
| Carrier pass-through fee | ~$0.003  | ~$0.003 (same, it is the carrier's) |
| 500-exhibitor trial      | ~$5.50   | ~$4.00                              |

A ~$1.50/trial premium for platform-enforced compliance is the right trade at
this stage. Revisit if volume reaches tens of thousands of messages a month.

Secondary reasons: the 10DLC registration flow is guided inside the Twilio
console rather than filed raw against The Campaign Registry; inbound webhooks
carry an `X-Twilio-Signature` HMAC that our edge function can verify with the
same pattern already used in `_shared/standardWebhookSignature.ts`; and the
REST API is plain HTTPS + Basic auth, so the Deno edge functions need no SDK.

**Set up a Messaging Service, not a bare phone number.** Advanced Opt-Out only
exists at the Messaging Service level, and the campaign attaches to the service.
A bare `from` number skips exactly the protection we are paying for.

---

## 2. Before you open the form

Gather these. A campaign is rejected, not paused, when an answer is missing,
and a rejected campaign costs a re-vetting fee to resubmit.

| Item                   | Notes                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Legal business name    | Must match the EIN record **exactly** — "MyK9Show LLC" ≠ "myK9Show, LLC". Mismatch is the #1 brand rejection. |
| EIN (Tax ID)           | Free and immediate from the IRS. See the sole-proprietor fallback below if there is no entity yet.            |
| Business address       | The registered address on the EIN record.                                                                     |
| Business website       | Must be publicly reachable and must show the SMS program — see §3.                                            |
| Entity type + industry | Private LLC / Corp; vertical is closest to "Technology" or "Entertainment".                                   |
| Authorized contact     | Name, business email, phone. Use a domain email, not Gmail — free-mail addresses lower the brand trust score. |
| Support email + phone  | Appears in the HELP reply. Must be `support@myk9show.com` — see below.                                        |

**The support address is `support@myk9show.com`,** matching the registered
brand website. Reviewers compare the brand's website domain against its
contact domain, and a mismatch is friction on a filing that is expensive to
redo — so the address should sit on the same domain as the site, even though
a different-domain address is not by itself fatal.

**Vercel cannot host that mailbox.** Vercel sells hosting, domain
registration, and DNS; it has never offered mailboxes on any tier, so no plan
upgrade produces one.

**The cheap path is forwarding, not a new mailbox.** `myk9t.com` — the
original Access-programs site, and the domain behind the seeded exhibitor test
accounts (`exhibitor1@myk9t.com` … `exhibitor5@myk9t.com`) — already has
working mailboxes. Point `support@myk9show.com` at one of them and the filing
gets its matching domain while the mail keeps landing where it already does.
Two ways, both cheap:

1. Add `myk9show.com` as an alias/secondary domain on the existing `myk9t.com`
   mail hosting, if that host allows it. Usually free, and it supports sending
   _as_ `support@myk9show.com`, not just receiving.
2. Failing that, ImprovMX forwards for free using only MX records, so DNS
   stays on Vercel. Receive-only on the free tier, which is enough here —
   brand verification mail lands there and the HELP reply merely points at it.

Forwarding still satisfies the "domain email, not free-mail" expectation on
the brand record: that rule is about the address, not where it terminates.

**No EIN yet?** There is a Sole Proprietor brand path that verifies via a phone
OTP instead. It is a poor fit: one campaign maximum, roughly 15 messages/minute,
a T-Mobile cap near 1,000/day, and no route to raise throughput later. Getting
an EIN takes about ten minutes and unlocks the standard path. Do that instead.

---

## 3. Two blockers to clear first (these are ours, in this repo)

Both are content, not architecture, and both are checked by a human reviewer
who will open the site. **Both are now done** — this section is kept as the
record of what the reviewer will find and why it is shaped that way.

### 3.1 The consent flow must be publicly visible — DONE

Reviewers verify opt-in by loading a URL. myK9Show's notification settings sit
behind auth, so a reviewer would see a login wall and reject the campaign for
"opt-in not verifiable" — the single most common rejection cause.

`/sms` is now a public route rendering `public/legal/sms-alerts.md` through the
same `LegalPage` component as `/terms` and `/privacy`, and is linked from both
footers. It states the program name, what is sent, frequency, the rate
disclosure, the verbatim consent checkbox wording, STOP/HELP handling, and the
mobile-information non-sharing sentence.

Two things about that page are load-bearing and easy to break silently, so
`src/test/routes/smsDisclosurePage.source.test.ts` pins them: the route must
not be wrapped in `ProtectedRoute`, and the disclosures must stay in the
markdown. Neither failure is visible in the UI — the page still renders fine
with the wording removed.

Its links to the privacy policy are absolute (`https://myk9show.com/privacy`)
on purpose: `LegalPage.inlineFormat` only linkifies `http(s)` URLs, so a
relative `/privacy` renders as plain text and leaves the reviewer with nothing
to click. That restriction is a deliberate `javascript:` guard with its own
test — do not loosen it to make relative links work.

### 3.2 The privacy policy SMS clause — DONE

`apps/myk9show/public/legal/privacy-policy.md` had no mention of SMS, text
messaging, or mobile numbers. Carriers require an explicit non-sharing
statement and its absence is an automatic rejection, so §3.6 "Mobile
Information and SMS Messaging" now carries it, along with the supporting
collection (§1.1), use (§2.3), and opt-out (§6.4) entries.

The carve-out sentence matters as much as the headline one: we _do_ hand the
number to the delivery provider, and naming that subprocessor is what keeps
"never shared with third parties" true rather than merely convenient.

Once a provider is live, add a Twilio row to the §3.2 service-providers table
in the policy — it is deliberately absent while no provider is wired, since
listing one we do not use would be inaccurate.

---

## 4. Registration, in order

Twilio Console → **Messaging → Regulatory Compliance → A2P 10DLC**.

1. **Register the brand.** Business details from §2. Typically approves in
   minutes to a few hours. If it fails, the cause is almost always a legal
   name or EIN mismatch — fix and resubmit rather than appealing.

2. **Consider standard vetting** (optional, ~$40 one-time). Raises the brand
   trust score, which raises per-carrier throughput. Worth it if a single show
   might alert more than a few hundred exhibitors in a day; skippable at first.

3. **Create the campaign.** Use case: **Low Volume Mixed**. It is the cheapest
   monthly tier and covers a single transactional notification plus room for
   future transactional messages without registering a second campaign.
   Know the ceiling: T-Mobile caps Low Volume Mixed near **2,000 messages/day**
   brand-wide. One alert per exhibitor keeps a large show inside that, but a
   second message type would not. Moving up later means a new campaign, not a
   new brand.

4. **Fill the campaign form** with the copy in §5.

5. **Create a Messaging Service**, buy a long-code number, add it to the
   service's sender pool, and attach the approved campaign. Enable
   **Advanced Opt-Out** on the service — this is the whole reason for choosing
   Twilio, and it is off by default.

6. **Point the inbound webhook** at the STOP/HELP handler once it exists, so
   `sms_opt_out_at` is recorded on our side too.

Campaign review is typically 1–3 business days for Low Volume Mixed, longer if
it bounces. Fees at time of writing: ~$4 one-time brand registration, ~$2/month
campaign, ~$1.15/month per phone number, plus one-time carrier campaign fees.
**Verify current pricing at submission** — these change without notice.

---

## 5. Exact answers for the campaign form

Copy these. They are written to match what the code actually sends.

**Campaign description**

> myK9Show sends dog-show exhibitors a single notification when their dog is
> approaching the ring, so they can be ready to compete. Recipients are
> registered users who entered a show through myK9Show and explicitly opted in
> to ring alerts in their account notification settings. This is a
> transactional alert tied to an event the recipient paid to enter. No
> marketing or promotional messages are sent.

**Sample messages** — these are the literal output of `buildProximitySms()` in
`supabase/functions/_shared/sms/smsMessage.ts`:

1. `Cooper (#314) is 3 dogs out in Excellent Interiors - myK9Show`
2. `Cooper is up next in Novice - myK9Show`
3. `myK9Show: You're signed up for ring alerts. Msg & data rates may apply. Msg frequency varies. Reply HELP for help, STOP to cancel.`

Sample 3 is the opt-in confirmation. It carries the full disclosure so the
recurring alerts do not have to — that is permitted, and it is why alerts 1–2
fit one GSM-7 segment. **This message does not exist in the code yet**; it must
be built and sent on opt-in, or the registration describes behaviour we do not
have.

**Opt-in workflow**

> Opt-in is web-based and explicit. A signed-in user opens Account →
> Notification Settings, enters their mobile number, and ticks an unchecked
> box reading: "Text me when my dog is close to the ring. By checking this box
> I agree to receive SMS ring alerts from myK9Show at the number above. Msg &
> data rates may apply. Msg frequency varies. Reply STOP to cancel, HELP for
> help." The box is never pre-checked, consent is not bundled with any other
> agreement, and SMS alerts are not required to enter a show. The wording
> shown, the timestamp, and the consented number are stored per user. The same
> disclosure is published at https://myk9show.com/sms.

That checkbox wording is the canonical text for
`notification_preferences.sms_consent_text_version = 'sms-consent-v1'`. If it
is edited, bump the version — the column exists to prove _what_ was agreed to,
not merely that something was.

**Opt-out** — keyword `STOP` (also STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT):

> You have been unsubscribed from myK9Show ring alerts. No more messages will
> be sent. Reply START to resubscribe.

**Help** — keyword `HELP`:

> myK9Show ring alerts: a text when your dog is close to the ring. Msg & data
> rates may apply. Reply STOP to cancel. Support: support@myk9show.com

The support address must match the one in the privacy policy (`support@myk9show.com`)
— a reviewer comparing the two will treat a mismatch as an inconsistency.

---

## 6. What gets campaigns rejected

In rough order of frequency:

1. **Opt-in not publicly verifiable** — the consent flow is behind a login.
   Solved by §3.1.
2. **No mobile-information clause in the privacy policy.** Solved by §3.2.
3. **Legal name / EIN mismatch** at the brand step.
4. **Sample messages that do not match the described use case** — e.g. a
   marketing-sounding sample under a transactional use case.
5. **No brand name in the message body.** Ours ends `- myK9Show`; keep it.
   The trailing brand is a compliance requirement, not decoration.
6. **Free-mail contact address** on the brand record.

---

## 7. Definition of done

- [ ] EIN obtained; legal name confirmed against the IRS record
- [ ] `support@myk9show.com` receiving, forwarded to an existing `myk9t.com` mailbox (§2)
- [x] Privacy policy carries the mobile-information clause (§3.2)
- [x] Public `/sms` disclosure page built (§3.1) — **must be deployed and reachable at
      `https://myk9show.com/sms` before filing**; a reviewer cannot load a preview URL
- [ ] Brand registered and approved
- [ ] Campaign submitted with the §5 copy, and approved
- [ ] Messaging Service created, number attached, **Advanced Opt-Out enabled**
- [ ] Opt-in confirmation message implemented and sent on consent
- [ ] Inbound webhook recording `sms_opt_out_at` on STOP
- [ ] End-to-end test to a real handset: opt in → alert → STOP → verify no
      further sends and that `sms_opt_out_at` is set

---

## Related

- Plan: [`docs/plan-google-apple-integrations.md`](../plan-google-apple-integrations.md) § L6
- Consent schema: `supabase/migrations/20260816140000_sms_consent_record.sql`
- Message composition: `supabase/functions/_shared/sms/smsMessage.ts`
- Deploy sequence for L1–L6, including the consent migration: [`operations/launch-integrations-deploy.md`](launch-integrations-deploy.md) § Phase 6
