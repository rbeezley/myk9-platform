# myK9 Platform Intent Document

**Date:** 2026-03-02
**Purpose:** Define the emotional intent behind every screen, interaction, and decision in the myK9 platform. This document is a compass for new work, not a mandate to redesign what exists.

---

## 1. Platform Soul

> *"The software disappears so the dogs can shine."*

myK9 serves people who love dogs, not people who love software. Our users are dog people first. Many are retired, most are volunteers, and all of them do this because they love the sport. The technology should never compete with that. It should feel like a calm, competent helper that handles the logistics so humans can focus on the dogs.

**Platform personality:** Calm. Simple. Respectful of your time and your expertise.

**What myK9 is NOT:**

- **Not flashy or trendy** — no animations for the sake of animations
- **Not clever** — no jargon, no hidden features, no "power user" shortcuts that leave beginners behind
- **Not demanding** — never makes you feel stupid, never asks you to remember how something works

---

## 2. Role Intent Map

Each role has a single intent word that captures how the software should make them feel. Every feature, screen, and interaction for that role should reinforce this word.

### Trial Secretary — *"That was easy"*

The secretary carries the most stress. The software should absorb complexity, not add to it.

| Moment | Target Feeling | What This Means in Practice |
|--------|---------------|----------------------------|
| Setting up a show | "The software already knows what I need" | Smart defaults, clone from previous shows, minimal required fields |
| Night before the trial | "Everything is handled" | A clear checklist view — green checks, not a wall of data |
| Show day chaos | "I can handle this" | Scratches, move-ups, and changes are calm one-tap operations, not multi-step wizards |
| After the show | "That went smoothly" | Results export and judge reports done in clicks, not hours |

**Anti-patterns to avoid:** Confirmation dialogs for routine actions. Multi-step forms. Technical error messages. Anything that makes the user feel like they need to "learn the software."

### Judge — *"Invisible technology"*

The judge's eyes should be on the dog, not the screen. Every interaction should be muscle-memory fast.

| Moment | Target Feeling | What This Means in Practice |
|--------|---------------|----------------------------|
| Starting a class | "I'm ready" | One tap to begin, entry list already loaded, timer ready |
| Scoring a dog | "Tap and done" | Largest possible touch targets, minimal scrolling, instant feedback |
| Between dogs | "What's next?" | Auto-advance to next entry, no hunting for buttons |
| Correcting a mistake | "Easy fix" | Undo is obvious and immediate, not buried in a menu |

**Anti-patterns to avoid:** Small buttons on tablet. Loading spinners between entries. "Are you sure?" popups. Anything that breaks the rhythm of the ring.

### Gate Steward — *"I've got this under control"*

The steward is the traffic controller. They need a clear, glanceable view of what's happening now.

| Moment | Target Feeling | What This Means in Practice |
|--------|---------------|----------------------------|
| Starting the day | "I can see everything" | Full class list with check-in status at a glance |
| Calling dogs | "I know exactly who's next" | Running order is obvious, scratches are visually distinct |
| Handling a scratch | "One tap, done" | Mark absent without navigating away from the list |
| Coordinating with the judge | "We're in sync" | Real-time status — both see the same thing |

**Anti-patterns to avoid:** Requiring navigation to perform common actions. Information hidden behind tabs. Stale data that doesn't match what the judge sees.

### Exhibitor — *"This respects my time"*

Exhibitors interact with the platform before and after show day. Every touchpoint should be fast and frictionless.

| Moment | Target Feeling | What This Means in Practice |
|--------|---------------|----------------------------|
| Entering a show | "That took 30 seconds" | Pre-filled dog info, remembered preferences, minimal taps to enter |
| Checking schedule | "I know where to be" | Clear, simple view — ring, time, class. No clutter. |
| Viewing results | "There it is" | Results appear quickly, easy to find their dog, shareable |
| Managing their dogs | "Everything is in one place" | Dog profiles, entry history, title progress — no hunting |

**Anti-patterns to avoid:** Long registration forms. Requiring re-entry of information the system already knows. Burying results behind login walls. Making the user feel like they're doing data entry.

### Site Admin — *"The platform is healthy"*

The admin sees the big picture. Their experience should be about oversight, not micromanagement.

| Moment | Target Feeling | What This Means in Practice |
|--------|---------------|----------------------------|
| Opening the dashboard | "Everything looks normal" | Key metrics at a glance, problems surfaced automatically |
| Investigating an issue | "I can drill down" | Clear path from summary to detail |
| Managing users/clubs | "Standard operations" | Bulk actions, search, filters — efficient for power users |

---

## 3. Design Guardrails

Universal rules that apply across every role and every screen.

### Accessibility First

Our users are not 25-year-old engineers. Many are retired, with varying levels of tech comfort and physical ability.

- **Large touch targets** — minimum 44x44px, prefer 48x48px on tablet views
- **High contrast text** — WCAG AA minimum, prefer AAA for primary content
- **Readable font sizes** — 16px body minimum, never below 14px for anything
- **No hover-only interactions** — everything must work on touch devices
- **No gesture-only actions** — swipe is a shortcut, never the only way

### Calm Over Clever

- **No surprise animations** — motion is purposeful (showing state change), never decorative
- **No notification overload** — batch non-urgent updates, surface only what needs immediate attention
- **Error messages in plain English** — "We couldn't save that score. Tap to try again." Not "Error 409: Conflict."
- **No software jargon in the UI** — use dog show terminology (which users know), not technical terminology

### Respect the Clock

- **Every common action completes in 1-2 taps** — if it takes 3+, redesign it
- **Smart defaults everywhere** — pre-fill what the system already knows
- **Remember user preferences** — last-used ring, preferred view, recent dogs
- **No dead ends** — every screen has an obvious next step or way back

### Offline Is Normal, Not Broken

- **Never show "No internet" as an error** — show it as a quiet status indicator
- **Local saves are instant** — the user never waits for a network round trip
- **Sync is background and silent** — no progress bars, no "syncing..." modals
- **Conflicts resolve calmly** — when sync conflicts occur, present clear choices, not technical diffs

---

## 4. The Litmus Test

Before shipping any feature, ask:

1. **Could my mom use this?** — If it requires explanation, simplify it.
2. **Does it match the role's intent word?** — Secretary: "easy." Judge: "invisible." Steward: "in control." Exhibitor: "respects my time."
3. **What happens with no internet?** — If the answer is "it breaks," redesign it.
4. **How many taps?** — If a common action takes more than 2, reduce it.
5. **What does the error state look like?** — If it would stress someone out on show day, rewrite it.
6. **Is the text big enough to read outdoors on a tablet?** — If you have to squint, increase it.

---

## How to Use This Document

- **New features:** Check against the role intent map and design guardrails before building.
- **Existing features:** When touching a screen for other reasons, check alignment and improve incrementally.
- **Design disagreements:** Use the role's intent word and the litmus test as tiebreakers.
- **Code reviews:** Flag anything that violates the guardrails.

This is a living document. Update it as we learn more about our users.
