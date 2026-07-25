# Low-Tech Exhibitor Walkthrough — Session Kit

> **Status:** Reference

Everything needed to run MYK9-71 task 7.7: _"Conduct one visible-label-only walkthrough with an elderly or low-tech test user, record confusion and completion evidence, and open follow-up issues for non-blocking findings rather than silently expanding this change."_

**This kit is not the evidence.** It is the preparation. Task 7.7 stays open until a real person has sat down and tried this, and the results are recorded in the template at the end.

## Why this one cannot be automated

Every other task in Section 7 was verified by machine. This one cannot be, and it is worth being precise about why, because the temptation to "simulate" it is real and would produce a confidently wrong result.

The automated suites answer: _does the interface work?_ They assert amounts reconcile, axe finds no violations, focus is reachable, records persist. This task asks something different: _does a person who does not already know the answer figure out what to do?_

An agent — or any developer who built the thing — cannot answer that. We know that "Records" holds health data, that the pip row means qualifying runs, that "Finish payment" refers to the balance shown two screens ago. That knowledge cannot be un-known on demand, and every prediction we make about a novice's confusion is really a prediction about our own mental model. The failure mode is not "we would be somewhat inaccurate"; it is "we would systematically fail to see the things a novice trips on, because those things are invisible to us."

So: a real participant, or the task stays open.

## Participant criteria

One participant is enough — this is a qualitative check for blocking confusion, not a study.

**Suitable:**

- Uses a computer or tablet for email, photos, and browsing, but not daily professional software.
- Has entered a dog show before, or at least understands what one is. The point is to test the interface, not the domain.
- Not a myK9Show user, and has not seen the app before.
- Comfortable saying "I don't know what that means" out loud.

**Unsuitable, however willing:**

- Anyone who has used the app, seen a demo, or heard it described.
- Developers, designers, or anyone who works in software.
- Anyone who will try to be helpful by guessing what you want to hear — this quietly destroys the signal.

## Environment preparation

Use the seeded staging exhibitor: `e2e-exhibitor@test.myk9.com`.

**Sign the participant in yourself before starting.** Authentication is not what is being tested, and a password fumble burns goodwill you need for the real tasks.

### Entitlement state

The account currently holds an **active complimentary Premium grant (2026-07-25 → 2026-10-23)**, issued during task 7.6. This decides what the participant can see, so choose deliberately:

| State | How | What it tests |
| --- | --- | --- |
| **Premium (current)** | leave as-is | The five Premium capabilities, unlocked. Recommended for a first session. |
| Free / expired | revoke via the admin grant control | Whether the upgrade prompts explain themselves. Note this makes tasks 4–5 below untestable. |

If you revoke it, the task 7.6 Playwright suite will start failing at its trigger assertion — by design, not by accident. Re-grant before running that suite.

### Existing account state, and why it helps

This account is realistically messy, which is better than a clean fixture:

- **Heartland Scent Work Classic** — 15 class entries across 5 dogs, mixing paid, pending, refunded and waived, with an order paid at checkout. Real money ambiguity to navigate.
- **A stale cart item** — the header badge shows "1" on every page.
- **Willow** — the dog with the widest record spread; the best subject for dog-related tasks.

Do not tidy any of this. The mess is the test.

### Recording

Screen recording with audio is ideal; a second person taking notes works. Ask permission first, and say the recording is of the screen and voice, not the participant. If they decline, take notes and do not push.

## Facilitator protocol

The name of the task is the whole discipline: **visible-label-only**. The participant navigates using only what is on the screen. You supply the goal and nothing else.

**Say the task in the participant's words, never the interface's.** Say "find out whether you owe any money for that show" — not "check the amount due on My Payments." The moment you speak an interface label, you have handed over the answer and the task is spent. It cannot be re-run with the same person.

**Rules while they work:**

- Silence is data. Count to ten before offering anything.
- Answer questions with questions: "What do you think that does?" / "What would you expect to happen?"
- Never point, hover, or lean toward the screen. People follow your eyes.
- Never touch the keyboard or mouse.
- Let them fail. A task they abandon is the single most valuable result you can get.
- If they ask "did I do that right?", say "there's no right answer — I'm testing the software, not you." Say this before you start, too.

**When to break protocol:** only if they are visibly distressed, or stuck so long the session is at risk. Record it as a **facilitator rescue** with the exact wording you used — a rescue is a finding, and a severe one.

## Tasks

Seven tasks, each aimed at something this change claims to have fixed. Run in order; stop at 45 minutes regardless of progress.

Give the participant the goal, then stop talking.

| # | Say this | Silently checking | Claim under test |
| --- | --- | --- | --- |
| 1 | "You've entered some shows. Find out which ones, and when the next one is." | Do they find My Shows? Do the counts read as dogs, entries, or orders? | Counts declare their unit and scope |
| 2 | "Find out whether you owe any money, and how much." | My Shows vs My Payments — do they agree? Is the "paid at checkout" order understood as settled? | Both surfaces agree on amount due |
| 3 | "One of your dogs is Willow. Find out what she's earned." | Can they reach Career? Does the pip row mean anything to them? | Overview / Career / Records consolidation |
| 4 | "Add a record of Willow's rabies shot from last month." | Do they find Records → Health? Does the date land on the day they chose? | Record integrity; date-only handling |
| 5 | "Now add a vaccination but leave the name blank, and try to save it." | Does the form explain the problem and keep their typing? | Invalid input never persists |
| 6 | "Find out what kind of account you have, and what it costs you." | Does "Complimentary Premium" read as free-to-them? Any contradiction with Pricing? | Entitlement source is explained truthfully |
| 7 | "There's something in your shopping cart. Find out what, and get rid of it." | Is the stale cart discoverable and clearable? | Stale-cart recovery |

**On task 5,** they may be reluctant to do something they think is wrong. Reassure: "I want to see what the software does when someone makes a mistake."

## What to record

For each task, before moving on:

- **Completed / completed with difficulty / abandoned / facilitator rescue.**
- **Time**, roughly. Ninety seconds on a task you expected to take ten is the finding.
- **First move** — the very first thing they clicked or looked for. Reveals their mental model more than anything else.
- **Wrong turns**, in order.
- **Verbatim quotes.** Write down what they actually said, not your paraphrase. "I don't know what a pip is" and "those dots don't mean anything to me" point at different fixes.
- **Where their eyes went** when stuck. Often the opposite corner from where the control is.

Capture screenshots of any screen that caused a pause — not just failures.

## After the session

**Triage each finding into exactly one bucket. This is where 7.7's real instruction bites: _"open follow-up issues for non-blocking findings rather than silently expanding this change."_**

| Bucket | Meaning | Action |
| --- | --- | --- |
| **Blocking** | Participant could not complete a task the change claims to have fixed | Fix under MYK9-71 before archiving |
| **Non-blocking** | Real friction, but the task completed, or it is outside this change's scope | **New Linear issue.** Do not expand MYK9-71. |
| **Not a finding** | Domain unfamiliarity, or a one-off slip they self-corrected | Note it, no action |

The middle row is the one that gets violated under time pressure. A walkthrough always surfaces more than the change owns, and folding "one more small fix" into MYK9-71 is how a scoped change turns into an unreviewable one. Precedent from this same change: [MYK9-92](https://linear.app/myk9-platform/issue/MYK9-92/fix-seriouscritical-a11y-violations-in-usereditpanel-admin-user-edit) and [MYK9-95](https://linear.app/myk9-platform/issue/MYK9-95/prove-focus-indicators-appear-because-of-focus-not-merely-that-they) were both split out rather than absorbed.

## Evidence template

Copy into `docs/ux-audits/exhibitor-lowtech-walkthrough-<YYYY-MM-DD>.md` and fill in during or immediately after the session.

```markdown
# Low-Tech Exhibitor Walkthrough — <YYYY-MM-DD>

> **Status:** Reference

MYK9-71 task 7.7. Facilitator: <name>. Duration: <n> min.

## Participant
Device: <desktop / tablet / phone> · Browser: <->
Tech comfort: <one or two sentences, no identifying detail>
Dog-show experience: <->
Prior myK9Show exposure: none

## Environment
Account: e2e-exhibitor@test.myk9.com · Entitlement: <complimentary / free>
Signed in by facilitator before start: <yes/no>

## Results

| # | Task | Outcome | Time | First move | Notes |
| - | ---- | ------- | ---- | ---------- | ----- |
| 1 | Find shows entered |  |  |  |  |
| 2 | Find amount owed |  |  |  |  |
| 3 | Find Willow's titles |  |  |  |  |
| 4 | Add vaccination |  |  |  |  |
| 5 | Save invalid record |  |  |  |  |
| 6 | Identify account type |  |  |  |  |
| 7 | Clear the cart |  |  |  |  |

## Quotes
> <verbatim>

## Findings

### Blocking
<!-- Fix under MYK9-71 before archiving. "None" is a valid and good answer. -->

### Non-blocking → follow-up issues
<!-- One Linear issue each. Record the issue key here once filed. -->

### Not findings
<!-- Domain unfamiliarity, self-corrected slips. -->

## Facilitator rescues
<!-- Each one, with exact wording used. "None" is the goal. -->

## Protocol deviations
<!-- Anything that compromises the result. Honesty here protects the next reader. -->
```

## Related

- Source audit that motivated this change: [`exhibitor-elderly-novice-2026-07-23.md`](exhibitor-elderly-novice-2026-07-23.md)
- Role intent (_"This respects my time"_): [`../INTENT.md`](../INTENT.md)
- Entitlement operational checks: [`../entitlement-operations.md`](../entitlement-operations.md)
