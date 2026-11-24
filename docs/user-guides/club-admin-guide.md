# Club Admin and Treasurer Guide

**Status:** `qa-draft`
**Audience:** Club administrators and treasurers
**Last verified:** 2026-10-28 — text checked against `main` at `0b537a807`; screenshots C-01, C-03, C-04, C-05 and C-06 recaptured 2026-10-28 against `main` at `542b6fa47`; non-author reviewer still pending
**Verified by:** text accuracy pass (documentation QA checklist, author walkthrough step list: labels, routes and flow steps checked against `apps/myk9show/src`); payout and fee claims last re-checked against `_shared/payoutCalc.ts` and `_shared/platformFee.ts` (MYK9-229), not re-checked in this pass; no browser walkthrough, screenshots re-captured 2026-10-28 from a throwaway local stack (no browser walkthrough of the text)

> **Note:** This is a QA-draft guide — written against the live app as a testing instrument. Ready screenshots are embedded; shots marked `blocked:` in the checklist below require specific seed data or conditions before they can be captured. Do not publish to customers until status is `verified`.

---

## What this guide covers

How to set up your club's profile, assign secretaries to shows, and connect your bank account to receive show payouts.

If you've used other show-management software before, the main change is that entries, payments, and results all flow through one place — you do not need to log into a separate payment processor to see your balance. Exhibitors can pay by card online, and your secretary can also record a Check or Cash payment on an entry.

---

## The platform and Stripe — who does what

Your club receives entry fees through a payment processor called Stripe. Here is the boundary between what myK9Show does and what Stripe does:

| myK9Show does                                                                              | Stripe does                                                             |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Hosts the show and collects entries                                                        | Processes exhibitor credit card payments                                |
| Calculates the amount owed to your club                                                    | Holds the money during the show period                                  |
| Initiates the deposit to your club after the show                                          | Deposits the money into your bank account                               |
| Shows payout history and status                                                            | Sends identity verification requests directly to the treasurer          |
| Charges exhibitors a service fee on top of the entry fee — never deducted from your payout | Deducts its card processing fee from the platform, not from your payout |

**Why Stripe contacts the treasurer directly:** Stripe is legally required to verify the identity of the account holder before releasing funds. This is a U.S. regulatory requirement, not a myK9Show request. When you receive an email from Stripe asking for information, respond directly to them.

### If you asked for a new club

You ask for a club once, on the myK9Show home page. Choose **Add your club**, sign in or create a free account, and fill in the form: club name, organization (AKC, UKC or ASCA), at least one club number and your contact details. Then choose **Add my club**.

The club exists right away, and you are its **Club Admin** and its **Show secretary**. You can build a show and connect the club's bank account the same day. The screen reads "Your club is waiting for myK9Show approval." Nothing is public until myK9Show approves the club, usually within a day. You get an email when you ask and another when the club is approved or not.

If the form says "A club with this name is already on myK9Show", the club is already here. Ask its admin to add you, or email us.

These permissions apply only to your club. They do not give you access to another club's shows.

**What happens next:** your home page shows a card titled with your club's name, for example **Get Heartland Scent Work Club's first show published**, that lists what is left. It goes away after your club publishes its first show. [Section 2](#section-2--your-clubs-shows) explains the list on each draft show.

**If your club is already on myK9Show,** do not ask for it again. Ask its club admin to add you (see [Section 3](#section-3--appoint-a-show-secretary), and [Section 7](#section-7--club-members) for adding an admin).

---

## Section 1 — Club Profile Setup

Your club profile holds the information that flows into every show your club hosts and every AKC results submission: club name, AKC/UKC/ASCA club numbers, mailing address, and contact information. Keeping this current saves corrections later.

**Your club is already in the system** when you first sign in: it was created when you asked for it on the home page. You are here to review and update it, not create it from scratch. If your club is not in myK9Show yet, open the account menu, choose **Account**, then **Request additional access**, and under **Set up a new club** click **Add your club**. A club that is waiting for approval shows "Waiting for myK9Show approval" on its page.

1. Sign in with your Club Admin account.
2. In the sidebar, open **My Club**. Your club's page opens.
3. Open the **Actions** menu at the top → **Edit club**. The panel has three tabs: **Basic Info**, **Contact** and **Premium**.
4. Review each field:
   - **Club Name** (as it appears on AKC paperwork), **Description**, **Club Type** and **Founded** on **Basic Info**
   - **AKC club number**, **UKC club number** and **ASCA club number** on **Basic Info** (enter at least one; these need an internet connection)
   - **Email Address**, **Phone Number**, **Website**, **Street Address**, **City**, **State/Province**, **ZIP Code** and **Country** on **Contact**
5. Update any field that is out of date → click **Save Changes**. If the club numbers cannot be saved, the panel tells you which part was saved and stays open so you can try again.

![Edit Club panel — Basic Info tab with club name, description and club type](../screenshots/C-01.png)

Changes take effect immediately on all future shows. Existing shows that have already been submitted to AKC are not retroactively changed.

---

## Section 2 — Your Club's Shows

The **Shows** page lists every show your club is hosting or has hosted. To start a new show for your club, open your club's page and use **Actions** → **Add Show for this club**.

1. In the sidebar, open **My Club**, then **Our Shows**. (**Browse** opens every show you can see, with tabs for Shows and Dogs.) Your club's page also lists them under **Upcoming Shows** and **Past Shows**.
2. Each show card displays the show name, dates, and entry status.
3. Click a show to open it.

![Shows list filtered to your club — cards for past and upcoming shows](../screenshots/C-02.png)

**Before you can publish.** Every draft show carries a list headed **Before you can publish**. It shows only what stands in the way. Most lines link to the place to fix them. A line that waits on someone else says who: myK9Show, Stripe or your club's admins. The same list appears on the show's page, on the wizard's **Review** step and on the **Show Created!** screen. The lines you may see are:

- "Your club is waiting for myK9Show approval." Waiting on myK9Show, usually about a day.
- "Your club has not finished setting up payouts." or "Stripe is reviewing your club's bank account." See [Section 4](#section-4--connect-your-bank-account-to-receive-payouts).
- "Publish the premium list, or turn on "We publish our own premium list"." On a saved show this line links to the **Premium List** card on the show's **About** tab. On the wizard's **Review** step, before a new show is saved, it has no link: choose **Add Show**, then publish the premium from the saved show's **About** tab.
- "Set when entries open and close."
- "Entries have to open before they close."
- "Turn online entries on." Only an older draft saved with online entries off shows this. There is no switch for it any more: email [support@myk9show.com](mailto:support@myk9show.com).

Publish is refused until every line is gone, and the refusal names what is missing. The list goes away when the show is published.

**You manage your club's shows.** Opening one of your club's shows gives you the same four tabs a secretary gets, and each tab is a real page with its own address, not a panel:

| Tab             | What you can do there                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview**    | The show home: the schedule, each class's work and checklist, trials and classes (add, edit, delete); Add Trial, Select classes and the show tools are in the header **Actions** menu |
| **Entry Forms** | Approve entries, record payments, handle pulls, refunds, move-ups and the waitlist                                                                                                    |
| **Results**     | Review and release results, submit them to the registry, then close the show                                                                                                          |
| **Reports**     | Print any of the show's reports, grouped by **Before the show**, **During the show**, **After the show**, and **Anytime**                                                             |

The **Actions** menu in the top bar has **Edit show**, which opens the show's edit panel. It appears only for shows you manage; it does not expand your permissions.

**Three jobs stay with the trial secretary:**

- **Typing in entries on someone's behalf.** **Add entry** (Actions menu) and **Add late entry** (Entry Forms → More) are shown to you greyed out, with the reason **"Trial secretary access only"** — visible, so you can see they exist, but not yours to use.
- **Entering scores from paper.** **Enter results from scoresheet**, on the Overview class panel, is greyed out for the same reason. Scoring belongs to the judge and the secretary; you can read every score on the Results tab.
- **Volunteer scheduling.** **Open volunteer scheduling** in the show's Actions menu (Show logistics → Volunteers) is greyed out for the same reason; the scheduling page itself is the secretary's.

If you follow a link into one of those pages anyway, you land on a page that says **"Trial secretary access only"** and explains why, with a way back — not a dead end.

If your club needs any of those done, ask your secretary — or grant secretary access to the person who will do them (see [Section 3](#section-3--appoint-a-show-secretary)).

---

## Section 3 — Appoint a Show Secretary

Show access is managed from the **Members** tab of your club's page, on its **Show secretaries** tab and in each member's action menu, not from the show itself. This is how you give **someone else** the operational role — you do not grant it to yourself. Your own club admin role already covers your club's shows (see [Section 2](#section-2--your-clubs-shows)).

When you appoint someone to show access, they can manage any of your club's shows, and they get the three things your own role does not carry: entering on an exhibitor's behalf (mail-in, phone, walk-up) and late entries, entering results from paper scoresheets, and volunteer scheduling. Everything else — entries, run order, show-day operations, results, and registry submission — they share with you.

**The person does not need to be a club member.** Appointment is the grant, and club membership is not checked, so you can appoint a hired or professional secretary who is not on your roster. A member whose membership lapses, is suspended, or is resigned keeps show access until you revoke it.

**To appoint anyone with a myK9Show account:** open **My Club** → **Members**, go to the **Show secretaries** tab, click **Appoint show secretary**, search for the person by name or email, select them, and click **Appoint**.

**To appoint someone already on your member list:**

1. In the sidebar, open **My Club**, then **Members**.
2. Find the person you want to make secretary.
3. Click **⋮** (the action menu) next to their name.
4. Under **Show secretary**, click **Appoint show secretary**.

![Members tab — members with the Show secretary badge on those who can run shows](../screenshots/C-03.png)

The member's row now shows a **Show secretary** badge (key icon) indicating active show access. They can sign in and immediately access show management for all of your club's shows.

**When someone asks for access:** an exhibitor can ask your club for secretary access from **Request additional access**. Every active club admin of your club receives an email with their name, email address, and reason. The request also appears on the **Show secretaries** tab under **Pending requests**, which shows a count badge while requests are waiting. Click **Approve** to appoint them, or **Deny** to decline, optionally with a reason. The requester is emailed either way, and your reason is included in the email. They also see the decision, and your reason, when they return to **Request additional access**.

**To revoke access:** open the same **⋮** menu and click **Revoke show secretary**, or use **Revoke** on the **Show secretaries** tab. The person loses management access immediately. If they are a club member, they stay one.

> **Note:** Show access is club-wide — anyone you appoint can manage all of your club's shows, not just one. There is no show-by-show secretary access: naming someone as an official on one show is paperwork only and grants nothing. Judges are assigned to shows or classes separately and do not need to be club members.

---

## Section 4 — Connect Your Bank Account to Receive Payouts

Before your club can receive entry fee revenue, a treasurer needs to complete Stripe's onboarding. This takes about 10 minutes and only needs to be done once per club. The bank step needs a club admin. If your treasurer is not one yet, add them first (see [Section 7](#section-7--club-members), **Admins tab**), then point them to this section: the steps below are theirs.

**Have this ready before you start:**

- Your club's EIN (it's on the club's tax paperwork)
- The club's legal name and mailing address
- One of the club's checks — use the club's bank account, not a personal one
- The treasurer's name, date of birth, home address, and Social Security number (at least the last 4 digits)

> **Why the SSN?** Stripe is required by law to verify the identity of the account representative. Stripe handles identity verification and usually starts with the last 4 digits. If it cannot verify the person that way, it may ask for more, such as the full number. Enter it only on Stripe's own pages.

**Steps:**

1. In the sidebar, open **My Club**, then **Payments**. Your club's page opens on its **Payments** tab, in a card called **Bank account**.
2. Click **Connect bank account**.
3. Review the checklist on screen — confirm you have everything listed above.
4. Click **Continue to Stripe** → you leave myK9Show and enter Stripe's onboarding form.
5. Fill in your club's details as prompted. When you finish, Stripe returns you to myK9Show.

![C-04: Payments tab — Bank account card with the Connect bank account button](../screenshots/C-04.png)

**A secretary who is not a club admin cannot connect the bank.** On the show's **Before you can publish** list, the payouts line can name the club's admins and offer **Email them the link**. That opens an email draft addressed to the admins, which the secretary sends. The Payments link is in the email's body: follow it from the email. Watch for that email, and for the line to clear once payouts are enabled.

Once onboarding is complete, the Payments tab shows a **Payouts enabled** badge. Your club will receive a deposit automatically after each show closes — you do not need to request it.

**Onboarding incomplete?** If you close the browser mid-way, return to **Payments** and click **Finish setting up** to pick up where you left off. If the setup link expired, click **Continue to Stripe**.

**Account under review?** Stripe sometimes reviews new accounts before enabling payouts. The Payments tab will show **Under review by Stripe**, with an **Add missing information** button in case Stripe asked for more. This typically resolves within 1–2 business days. If it takes longer, contact Stripe directly — they handle verification, not myK9Show.

For the full step-by-step treasurer walkthrough with screenshots, see [Club Treasurer Guide — Receiving Show Payouts](../operations/stripe-treasurer-guide.md).

---

## Section 5 — Payout Timing and History

After your show's end date, myK9Show automatically initiates a deposit to your club's linked bank account. The Payments tab shows each show's payout.

**When does the deposit arrive?**

About three days after the show's end date. During the launch period myK9Show checks each payout before it is sent, so the payout can go a little later than that. While a payout is awaiting that release, the Payments tab shows it as **Payout scheduled, waiting for release** (a club whose bank setup is not finished sees **Waiting for account** instead). Once it is sent, your bank typically posts it the following business day. Weekends and bank holidays may add one day.

**What is the deposit amount?**

> Total online entries collected − any refunds issued by your secretary

**Your club receives 100% of entry fees.** The service fee is never deducted from your payout: exhibitors pay it on top of the entry fee at checkout, and it covers Stripe's card processing plus running the platform. See [How our fees work](https://myk9show.com/fees) for the split.

**Example:** 40 entries at $32 each = $1,280 collected. After a $32 refund for one withdrawn entry, your club receives $1,248.

**Viewing past payouts:**

1. In the sidebar, open **My Club**, then **Payments**.
2. The **Show reconciliation** card lists each show with its net amount, the transfer amount, the date, and a status.

![C-05: Payments tab — Payouts enabled, with the Show reconciliation card listing a show's transfer and Paid status](../screenshots/C-05.png)

| Status                                    | Meaning                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| **Paid**                                  | Deposit sent; should appear in your bank within one business day         |
| **Sending**                               | Transfer is in progress                                                  |
| **Scheduled**                             | Your account is ready and the transfer has not gone out yet              |
| **Payout scheduled, waiting for release** | myK9Show is checking the payout before it is sent. Nothing for you to do |
| **Waiting for account**                   | Stripe onboarding is not yet complete                                    |
| **Retrying**                              | A transfer attempt failed; it will be retried automatically              |
| **Needs attention**                       | A transfer failed and will not retry on its own                          |
| **Earlier attempt**                       | An older transfer for the same show; a later attempt replaced it         |

A show whose net amount is still being worked out reads **Net pending**.

**Need itemized records?** Open the show, go to the **Entry Forms** tab, and export from there — you do not need to ask the secretary. The **Reports** tab also carries the Financial Report, which sits under the **Anytime** heading because it is as useful while entries are open as it is at reconciliation.

---

## Section 6 — Common Treasurer Questions

**"Stripe is asking for my SSN — is this normal?"**
Yes. Stripe requires identity verification for all account representatives before enabling payouts. They usually start with the last 4 digits, and may ask for more if they cannot verify the person that way. This is a legal requirement, not a myK9Show policy.

**"When will we get paid?"**
About three days after your show's end date, once myK9Show has checked the payout. Your bank typically posts it the following business day after it is sent. See [Section 5](#section-5--payout-timing-and-history).

**"Stripe says our account is under review. What do we do?"**
Wait 1–2 business days. Stripe reviews new accounts before enabling payouts. If it takes longer, contact Stripe directly at the email address they provided during onboarding.

**"How do we update our bank account in Stripe?"**
Log in to your Stripe Express dashboard at **express.stripe.com** using the email address you used during onboarding. From there you can update bank details, view transfer history, and manage the account.

**"What if we need to refund an entry after the show?"**
Your secretary handles refunds from the show's **Entry Forms** tab. Once your club's payout for a show has been sent, refunds can no longer be issued in myK9Show, and the app tells your secretary so. Any refund after that is your club's to pay the exhibitor directly.

**"What does the service fee cover?"**
Two things: Stripe's card processing, which myK9Show neither sets nor receives, and myK9Show's own share, which funds the platform your show runs on. It is charged to the exhibitor on top of the entry fee and is never taken out of your payout. The current rate and an approximate split are on the Payments tab and at [How our fees work](https://myk9show.com/fees).

---

## Section 7 — Club Members

The **Members** tab lists your club's member roster. Each member has a **Type** (Full Member, Associate, Junior or Honorary) and a **Status** (Active, Lapsed, Suspended or Resigned). Use it to add members, change their type or status, and give or take away show access.

> **Note:** This is not a general membership roster. It lists only people who have been added to your club in myK9Show. Membership alone does not let anyone set up or run shows; that is appointing a **Show secretary** (Section 3).

**View current members:**

1. In the sidebar, open **My Club**, then **Members**. Your club's page opens on its **Members** tab.
2. The **Members** view lists each person with their type and status. Switch between **All**, **Active**, **Lapsed**, **Suspended** and **Resigned**, or search by name or email.

![Club Members tab — the Members, Officers, Show secretaries and Admins sub-tabs above Membership requests](../screenshots/C-06.png)

**Membership requests:** exhibitors can ask to join your club from **Request additional access**. Every active club admin of your club receives an email about each request. Waiting requests appear at the top of the **Members** view under **Membership requests**, and the tab shows a count badge. **Approve** adds the person to the member list as an active member, without show access. **Deny** declines, with an optional reason. The requester is emailed either way, and your reason is included. A denied person cannot send the same request again, but you can still add them yourself at any time.

**Add a member:**

1. On the Members tab, click **Add Member**.
2. Search for the person by name or email and select them.
3. Choose a **Membership Type**.
4. Click **Add Member** — they are on the roster immediately.

![Add Member dialog — name/email search filtered to fixture accounts, with membership type selector](../screenshots/C-07.png)

If the person does not appear in the search, they may not have a myK9Show account yet. Ask them to sign up first, then add them once their account is active.

**Change a member's type or status, or remove them:**

1. Find the member in the list → open their **⋮** action menu.
2. Choose **Change Type** or **Change Status** and pick the new value, or choose **Remove Member**.
3. For **Remove Member**, confirm with **Remove member**. They are off the roster immediately.

**Admins tab:**

Use the **Admins** tab to give another person club admin access, for example your treasurer. Club admins can edit the club, manage members, appoint secretaries and open Payments.

1. On the Members page, open the **Admins** tab.
2. Under **Add an admin**, type the email on their myK9Show account and click **Add admin**.
3. Confirm "Add (their email) as an admin of (your club)?" with **Add admin**. They become an admin at once.

The person needs a myK9Show account first. To take access away, click **Remove admin** beside their name and confirm. A club always keeps at least one admin, so the last one cannot be removed. Changing admins may ask you to type your password again.

**Officers tab:**

The **Officers** tab tracks the club's formal officers. Click **Assign Officer**, choose the person and a **Position** (President, Vice President, Secretary, Treasurer or Board Member). This is for your club's internal reference. It does not change what anyone can do in the app.

---

## Still need help?

- [Club Treasurer Guide — Receiving Show Payouts](../operations/stripe-treasurer-guide.md) — full Stripe walkthrough
- [Secretary Guide](secretary-guide.md) — for the person managing show day
- Support: [support@myk9show.com](mailto:support@myk9show.com)

---

## Screenshot Checklist

All shots to be captured and added to `docs/training/screenshot-shot-list.md`. Status as of 2026-10-28 (stale = the app no longer looks like the caption; recapture before `verified`):

| Shot ID | Section | Description                                                 | Status                                               |
| ------- | ------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| C-01    | § 1     | Club Settings form — all fields visible                     | captured 2026-10-28 (MYK9-1462)                      |
| C-02    | § 2     | Club Admin → Shows list                                     | ready                                                |
| C-03    | § 3     | Members page — member row with Show secretary badge         | captured 2026-10-28 (MYK9-1462)                      |
| C-04    | § 4     | Payments page — pre-onboarding "Connect bank account" state | stale: shows the old "Connect payment account" label |
| C-05    | § 5     | Payments page — payout history table                        | captured 2026-10-28 (MYK9-1462)                      |
| C-06    | § 7     | Club Members page — members list                            | captured 2026-10-28 (MYK9-1462)                      |
| C-07    | § 7     | Add Member dialog                                           | ready                                                |
