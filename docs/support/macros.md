# Support Macro Library

Reusable reply snippets for email, chat, and follow-up. Each macro is 2–4 sentences maximum plus a link or action.

**Usage rules:**
- Replace `[brackets]` before sending. Never send a macro with unfilled placeholders.
- Every macro ends with a specific link or a clear next step — the customer should not need to reply asking "what do I do now?"
- Tone: warm, specific, not corporate. Write as if you know them from the last show.
- KB article links use placeholder paths. Replace with the live URL before use, or use the interim GitHub rendered link.

---

## Intake and Acknowledgment

### M-01 — Universal intake request

_(Also appears as a ready-to-send email in `docs/support/intake-template.md`.)_

```
Hi [Name] — to look into this quickly I need a few details: the email you use to sign in, the show or club name, which page you were on, exactly what the app said on screen, and your device (iPhone / Android / Mac / PC). A screenshot is even better if you have one. Was this at the show venue or at home?
```

### M-02 — "Send me the exact error text"

Use when the customer described a problem but did not include the verbatim message.

```
Hi [Name] — could you copy the exact message the app showed, word for word? Even a quick screenshot works. That exact phrasing helps me find the right answer for you much faster.
```

### M-12 — "We are checking this"

Use while actively investigating. Follow up within 2 hours.

```
Hi [Name] — I have what I need and I'm looking into it now. I'll get back to you by [time/date]. If it's an active show and anything changes in the meantime, reply here and I'll prioritize.
```

---

## Entry and Registration

### M-03 — Entry not showing after payment

```
Hi [Name] — payments sometimes take a few minutes to appear because of how Stripe notifies our system. Your entry should show up in My Shows within 5–15 minutes. If it has been more than an hour and it is still missing, reply here with your email address and the show name and I will look it up directly.
```

**Link:** [KB: Why isn't my entry showing after I paid?](../knowledge-base/articles/entry-not-showing.md) _(planned)_

### M-04 — Confirmation email not received

```
Hi [Name] — confirmation emails can occasionally land in spam or promotions folders. Please check there first and add [email address] to your contacts. If you entered a show and can see it in My Shows, your entry is in the system regardless of whether the email arrived. If you cannot find your entry at all, reply here and I'll check on it.
```

**Link:** [KB: I didn't receive a confirmation email](../knowledge-base/articles/entry-not-showing.md) _(planned)_

### M-05 — Entry status: what "Pending" means

```
Hi [Name] — a Pending entry means your payment was received and your entry is waiting for the secretary to review it. This is normal and expected — most secretaries review entries in batches. You will receive an email when the status changes. If your entry has been Pending for more than a week after the entry close date, feel free to reply and I'll check in with the secretary.
```

**Link:** [KB: What does my entry status mean?](../knowledge-base/articles/entry-status.md) _(planned)_

### M-13 — Exhibitor wants to withdraw an entry

```
Hi [Name] — to pull an entry, please send a message to the trial secretary directly through the show's Messages section in myK9Show. Withdrawals are handled by the secretary; they can pull the entry and initiate a refund if one applies. If you're not sure how to reach them, reply here and I'll get you the contact.
```

### M-14 — Entry class change request (secretary-only action)

```
Hi [Name] — class changes after you have entered are handled by the trial secretary, not through the app. Please send them a message through the Messages section in myK9Show and let them know which class you'd like to move to. If there is space, the secretary can make the change.
```

---

## Account Access

### M-06 — Cannot sign in

```
Hi [Name] — let's start with the basics: make sure you're using the same email address you signed up with. If you use a magic link (an email to sign in), check your spam folder. If that's all fine and you're still stuck, reply here with your email address and I'll check the account directly.
```

**Link:** [KB: I can't sign in](../knowledge-base/articles/cant-sign-in.md) _(planned)_

---

## Offline and App Issues

### M-07 — App showing offline

```
Hi [Name] — the app is designed to work without a connection at show venues, so an offline banner is expected at a show with spotty signal. Once you're back on a reliable connection, any changes you made will sync automatically. If the app still shows offline at home on a stable connection, try a hard refresh (Ctrl+Shift+R on desktop) or clear the app's data in your browser settings. Let me know if that doesn't fix it.
```

**Link:** [KB: The app says Offline — is something wrong?](../knowledge-base/articles/offline-mode.md) _(planned)_

---

## Stripe and Payments

### M-08 — Stripe asking for SSN or bank info

```
Hi [Name] — this is completely normal and is coming directly from Stripe, not from myK9Show. Stripe is required by U.S. financial regulations to verify the identity of account holders before they can receive payouts. The information goes directly to Stripe and is never visible to us. You can complete the verification through the link Stripe emailed you, or by logging into your Stripe Express dashboard. Let me know if you have any trouble finding that email.
```

**Link:** [KB: Stripe is asking for my SSN — is this normal?](../knowledge-base/articles/stripe-onboarding.md) _(planned)_

### M-09 — Stripe account under review

```
Hi [Name] — when Stripe places an account under review, it means they need additional information before releasing a payout. This is a standard Stripe process. Check the email from Stripe for the specific items they need — it is usually an owner's SSN, business EIN, or bank statement. Once you provide what they ask for, payouts resume automatically, usually the same or next business day. If you're not sure which email to look for, it will be from Stripe and will reference your Stripe Express account.
```

### M-10 — Payout timing

```
Hi [Name] — payouts are initiated after the show closes and the payout is processed, then typically take 2–7 business days to reach your bank account depending on your bank. If it has been more than 10 business days since the show closed, reply here with the show name and approximate close date and I'll look up the transfer status.
```

**Link:** [KB: When will we get paid?](../knowledge-base/articles/payout-timing.md) _(planned)_

### M-11 — Club payment setup (onboarding start)

```
Hi [Name] — to receive payments for your shows, you'll set up a free Stripe Express account for your club. It takes about 5–10 minutes and you'll need your club's EIN and a bank account for deposits. Everything you need is in the setup guide — it walks through every step. Reply here if you get stuck on any screen.
```

**Link:** [Club Payment Setup Guide](../operations/stripe-treasurer-guide.md)

---

## Results

### M-15 — Results not visible yet

```
Hi [Name] — results become visible after the trial secretary reviews and releases them, which usually happens in the day or two after the show. If it has been more than three days since the show ended and results are still not visible, reply here with the show name and I'll follow up with the secretary.
```

**Link:** [KB: Where do I see my results?](../knowledge-base/articles/view-results.md) _(planned)_

---

## Club Administration

### M-16 — Club member access question

```
Hi [Name] — club member access is managed by your club admin in the Members section of myK9Show. If you need someone added or removed, ask your club admin to make the change there. If you are the club admin and cannot find the Members section, reply here with your club name and I'll check your access.
```

---

## Escalation

### M-ENG — Engineering escalation (internal; do not send to customer)

_Use this to capture the handoff when a ticket needs engineering._

```
ESCALATION
Customer: [name], [email]
Show/Club: [name]
Reported: [date]
Symptom: [one sentence]
Investigation done: [what you checked, what you found]
Cookbook recipe followed: [link]
Expected behavior: [what should have happened]
Actual behavior: [what happened]
Reproduction steps: [steps to reproduce, or "not reproducible from support tools"]
Priority: P0 (live show) / P1 (pre-show, imminent) / P2 (no live impact)
```
