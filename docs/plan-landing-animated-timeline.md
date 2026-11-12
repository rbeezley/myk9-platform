# Landing page: animated real-screen timeline, trust bar, pricing and FAQ (MYK9-1894)

> **Status:** Active
>
> **Hold:** do not start until the owner says the current round of page fixes is finished. The scenes are captures of product screens, so capturing while those screens are still changing means capturing twice.

Linear: [MYK9-1894](https://linear.app/myk9-platform/issue/MYK9-1894). Predecessor: [`archive/plan-landing-lifecycle.md`](archive/plan-landing-lifecycle.md) (MYK9-1141), which built the current timeline.

## Why

The show-lifecycle timeline tells the right story, but the owner does not like how it is presented. Each step is two columns of static screenshots shrunk until they cannot be read, and what the other audience is doing is described in text.

On 2026-11-12 the owner approved a new presentation from a prototype of the "Entries open" step:

- The secretary's screen and the exhibitor's phone share one scene.
- Real captures of the app zoom to the part each numbered line is about, with a ring on the control or row in question.
- The phone reacts to what the secretary does, so "meanwhile" is shown.
- The scene plays itself, can be paused, and jumps when a numbered line is pressed.

Reference: the prototype is linked from the Linear issue, and [`design/landing-timeline-prototype/`](design/landing-timeline-prototype/README.md) describes how its screens were captured. The inspiration was Toast's product page (`pos.toasttab.com`), for one mechanic only: product UI that walks itself through numbered steps.

## Does this duplicate an existing surface?

No. It replaces the presentation of an existing section and deletes the old one (`ScreenshotExplainer` and the two-column screenshot layout). Pricing and the FAQ are new sections; neither exists on the public site today.

## What stays

- Six steps and their order: Set up, Entries open, Before show day, Show day, Results, After.
- The two audiences and the switch ("I'm running a show" / "I'm entering a show"), owned by `Home.tsx`, with clubs first (`DEFAULT_AUDIENCE`).
- The copy rules (`BANNED_COPY`) and the rule that every claim has a KEEP row in [`qa/landing-lifecycle-evidence.md`](qa/landing-lifecycle-evidence.md).
- The calls to action: "Add your club" and "Create a free account".
- The working practice scoresheet (`ScoresheetDemo`) and the night-before checklist (`NightBeforeCard`).
- Light-only landing surface, Playfair Display and the terracotta palette in `landing.css`.

## Page order

1. Hero, with one looping scene as its visual
2. Trust bar
3. Timeline (the centrepiece)
4. Pricing
5. FAQ
6. Closing call to action

Not included, and why:

| Left out                              | Reason                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| Testimonials                          | myK9Show has no users yet. Add when real quotes exist.                                 |
| A separate "problem / before" section | The hero subhead and the show-day step carry it. `INTENT.md` asks for calm, not alarm. |
| A three-role persona switcher         | Judges and stewards do not choose the software. They appear inside the show-day step.  |
| Live demo, board PDF, "book a call"   | No secretary asked for them, and a second call to action dilutes the one the page has. |

## The scene

One reusable component, `TimelineScene`, driven by data in `lifecycleStories.ts`.

- **Devices:** a desktop frame (5:3) and a phone frame (9:16). For the club audience the desktop leads; for exhibitors the phone leads. The other device dims while it is not the subject.
- **Frames:** each scene is a short list of frames. A frame names, per device, which capture to show, the region to zoom to and an optional ring, all in the capture's own pixels. A numbered line owns one or more frames.
- **Camera:** every capture of one device shares the same camera values, so cross-fades between two states of the same screen line up exactly.
- **Regions are measured, not typed by eye.** The capture script writes each highlighted element's bounding box to JSON beside the images.
- **Controls:** Pause / Play, and each numbered line is a button that jumps to its first frame.
- **Progress:** each line's number sits in a circle. The current line's circle draws itself as its part plays, and a finished line fills in with a tick (owner's choice, 2026-11-12, over a progress bar above the line).
- **Plays only while in view**, and stops when the tab is hidden.
- **Reduced motion:** the finished frame is shown and nothing moves. Pressing a line shows that line's last frame.
- **No scroll-jacking.** The page scrolls normally at all times.
- **Complete at rest:** the first frame is a full, readable scene before any script runs.

### Which steps get a scene

Six full scenes would make a very long page. Three steps sell the product and get the full treatment; the other three are one still and one line each.

| Step            | Treatment | Notes                                                                   |
| --------------- | --------- | ----------------------------------------------------------------------- |
| Set up          | Still     | Create Show wizard                                                      |
| Entries open    | Scene     | Prototyped; flow below                                                  |
| Before show day | Still     | Keeps `NightBeforeCard`                                                 |
| Show day        | Scene     | Judge's tablet scores with no signal; keeps `ScoresheetDemo` beneath it |
| Results         | Scene     | Secretary releases; exhibitor's phone shows the placement               |
| After           | Still     | Dog's record                                                            |

### The real "Entries open" flow (verified in code 2026-11-12)

1. The exhibitor presses "Enter this show" and gets a four-step wizard: Dogs, Classes, Payment, Receipt. A full class is marked "Full" or "Full: join waitlist" before they can enter it (`evaluate_entry_capacity`).
2. After submitting, My Entries shows the dog with "Pending review" and "The show secretary is reviewing this entry."
3. The secretary's Entry Forms list shows the form with "Needs review" and the payment state beside it, and "Review" as the next action.
4. "Review" opens the form panel. Under "To finish this form" the secretary presses "Accept". The panel reads "All set." and the exhibitor's chip changes to "Accepted".

Facts the copy must respect:

- Paying does not accept an entry, and an unpaid entry can be accepted.
- The secretary's list shows no class-limit figure. The limit is enforced when the exhibitor enters.
- Accepting sends no email. The secretary sends the decision email by hand.
- Armbands are not assigned by an online entry or by Accept.

## Capturing the screens

- Capture from a local dev server on current `main`, signed in as the seeded secretary and exhibitor, on the canonical seed show (Heartland Scent Work Classic, `dededede-0000-0000-0000-000000000010`).
- **Never write to the shared database to stage a state.** The prototype blocked every data-API write and produced the three states of one seeded entry (not there yet, needs review, accepted) by patching the responses the browser received. Use a fresh browser context per state, because the app caches rows locally.
- Seeded fixture names only. The live list also holds non-seed names lower down; keep them out of frame.
- Desktop captures at 1440×900, phone at 390×844 at 2× density.
- Commit the capture script so the images can be regenerated when the UI changes. The prototype's scripts are a starting point, not production code: they hard-code a Windows path and use the installed Edge.

## Phases

Each phase ends with its own checks passing. One pull request per phase.

### Phase 0: decisions and inventory

- Owner answers the open decisions below.
- Re-verify the Show day and Results flows in code the way Entries open was verified, and write each scene's numbered lines.
- Add or update KEEP rows in the evidence doc for every line.
- **Tests:** `lifecycleStories.test.ts` updated for the new data shape and still enforcing `BANNED_COPY`.

### Phase 1: the scene component and the Entries open scene

- Build `TimelineScene` and the frame data type. Move the capture script into the repo.
- Capture the Entries open images and regions. Replace that step in both audience stories.
- Delete `ScreenshotExplainer` and its test once nothing imports it.
- **Tests:** unit tests for frame-to-style math (region and ring to percentages), line-to-frame mapping, pause, jump, reduced motion and "plays only in view". Render the component on the real story data, not a hand-made prop. Run the landing E2E specs.

### Phase 2: Show day and Results scenes, and the three stills

- Capture and wire the remaining two scenes and three stills. Remove the old two-column layout and its CSS.
- **Tests:** as Phase 1 for the new scenes. Assert rendered geometry at 390px and 1280px (no horizontal overflow, devices stack on the phone). Shuffled full-suite run.

### Phase 3: hero, trust bar, pricing, FAQ

- Hero uses one looping scene. Check mobile LCP against [`plan-landing-hero-lcp-prerender.md`](plan-landing-hero-lcp-prerender.md) before and after.
- Trust bar: AKC, UKC and ASCA scent work, and the mySWT / myNWT track record. Fold in or replace `TrustSection`; do not keep both.
- Pricing section per the owner's decision.
- FAQ: five or six questions, each answer verified in code and given a KEEP row.
- **Tests:** `Home.test.tsx` for section order and banned copy on the rendered page; landing E2E specs; `E2E PR Smoke` clean.

### Phase 4: close out

- Browser walk of the finished page at desktop and phone width, both audiences, reduced motion on and off, with evidence recorded on the issue.
- Flip this plan to `Complete`, move it to `docs/archive/`, drop its row from `docs/README.md`.

## Open decisions (owner)

1. **Pricing.** Is club pricing decided? If yes, what is it and what do exhibitors pay? If no, the section ships as one line.
2. **Trust bar wording.** What may be said about mySWT and myNWT (years, number of trials, clubs)?
3. **FAQ questions.** Proposed: Does it work with no signal? Which registries? What do exhibitors pay? How do results get to the registry? What does switching involve? Can we try it before a real show?
4. **Hero visual.** Looping scene, or keep the photo and start the scenes at the timeline.

## Found while verifying the flow

Product-screen observations, outside this plan's scope. Filed 2026-11-12 at the owner's request.

- MYK9-1897: My Entries tells an exhibitor "the secretary will review it once it is paid", but payment does not gate review. Owner decision.
- MYK9-1895: My Entries tells a check payer to mail the check; the wizard says to bring it to the show.
- MYK9-1896: the card option and the checkout success page say entries "are confirmed" after payment, while a paid entry still awaits review.
- MYK9-1898: the "Needs review" pill is cut off in the Entry Forms list at 1440px wide with the form panel open.
- Not a bug, not filed: signed out, `/shows` lists no upcoming shows because the public list filters out demo clubs (`club.is_demo=eq.false`), and the seed show belongs to one. It matters here only for capture: the exhibitor's "Find a show" still needs a signed-in view or a non-demo fixture.
