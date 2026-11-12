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
- **Two modes, built together.** _Autoplay_ is the landing page's: the scene plays itself and loops. _Step-through_ is for the guides and the demo deck (see "After this plan"): nothing moves until the reader presses Next or Back, and the current step stays on screen while they do it. Same frames, same camera, same data shape.
- **No app dependencies.** The component takes data and images and nothing else: no auth, no replication, no router. The guides site (`apps/docs`) is a separate project and must be able to use it.
- **Plays only while in view**, and stops when the tab is hidden.
- **Reduced motion:** the finished frame is shown and nothing moves. Pressing a line shows that line's last frame.
- **No scroll-jacking.** The page scrolls normally at all times.
- **Complete at rest:** the first frame is a full, readable scene before any script runs.

### Which steps get a scene

Six full scenes would make a very long page. Three steps sell the product and get the full treatment; the other three are one still and one line each.

| Step            | Treatment | Notes                                                                    |
| --------------- | --------- | ------------------------------------------------------------------------ |
| Set up          | Still     | Create Show wizard                                                       |
| Entries open    | Scene     | Prototyped; flow below                                                   |
| Before show day | Still     | Keeps `NightBeforeCard`                                                  |
| Show day        | 2 scenes  | At the ring (judge, prototyped) and at the desk (secretary); flows below |
| Results         | Scene     | Secretary releases; exhibitor's phone shows the placement                |
| After           | Still     | Dog's record                                                             |

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

### Show day has two scenes (owner, 2026-11-12)

The judge is a key role and works almost entirely in Ringside, and the secretary has her own show-day screens, including typing results in from paper when tablets are not used. Show day therefore carries two scenes, one after the other, inside the one step. It does not add a third audience to the switch: judges do not choose the software.

Do not capture the desk scene until the page fixes are finished. Its lines are written now so the flow is checked; the screens are among those most likely to change.

### The real "Show day, at the ring" flow (verified in code and prototyped 2026-11-12)

The judge's tablet leads; the exhibitor's phone is the second device.

1. **The judge opens their ring.** Ringside's class list has a "Your ring" section with the judge's classes in order and how many dogs are left.
2. **The signal drops. The run order stays.** The entry list shows "Offline · scores saved on this device" and the dogs still to run.
3. **Time the run, mark the result.** The scoresheet has Start, then Stop, then Qualified, NQ, Absent, Excused or DQ. Faults appear for a Qualified run.
4. **Read it back, then submit.** "Score Confirmation" lists the result and time, with "Confirm & Submit". The tablet then says "Saved on this device. It will send when you're back online."
5. **It sends itself when the signal returns.** The exhibitor's My Entries row shows "New result".

Facts the copy must respect:

- Scoring is not gated on the date. The exhibitor's "Show day is here" banner is, and by the server's clock, so it cannot be staged by changing a browser clock.
- While the tablet is offline the exhibitor's phone does not change. "In ring" and the result both arrive only after the tablet reconnects.
- There is no auto-advance after a score. The judge chooses "Back to Entries" or a dog at the gate.
- The reconnect ("Score saved", the "Scores sent" toast, "Synced") was not captured, because capturing it would send a real score.
- Capture at 834px wide or wider until MYK9-1899 is fixed: at 768px the entry-list header breaks.

### The real "Show day, at the desk" flow (verified in code 2026-11-12, not captured)

The secretary's screen leads. The second device is the judge's tablet for lines 1 to 3. For line 4 there is no second device: the paper score sheet is the other half of the picture, so that frame needs a different treatment (a printed Score Sheet beside the screen).

1. **Your day is one list.** Show Desk opens on "Today's schedule". Each class row says where it stands, for example "Not started · 3 of 5 not checked in".
2. **Check dogs in as they arrive.** The Check-in desk searches by name, dog or armband, with a "Check in" button per dog.
3. **Watch a class run.** Once a class is "In progress" its row reads "Running · 2 of 6 scored · Willow in ring" as the tablets send their scores.
4. **No tablets? Type the scores in from paper.** "Open paper scoring" lists the class in run order. For each dog the secretary picks the result, types the search time and presses "Save & Next", until the heading reads "6 of 6 scored".
5. **Complete the class and move on.** Setting Status to "Complete" warns if paper scores are still missing, then offers "Continue on Results".

Facts the copy must respect:

- Show Desk updates when a tablet syncs, not continuously, and it does not show that a tablet still holds unsent scores.
- A dog that checked itself in looks the same at the desk as one the staff checked in.
- Paper scoring saves one dog at a time with "Save" or "Save & Next". There is no "Save all" and Enter does not save.
- Paper scoring writes to the device first, so it works offline once the show is on that device.
- Typing "12345" or "1:23.45" both mean 1 minute 23.45 seconds.
- The "Ready for show day" checklist is hidden on show day itself. It belongs to the Before show day step.
- Checking, releasing and the judge's initials happen on the Results tab. They belong to the Results step, not here.
- The evidence doc has no row for paper scoring. Every line above needs a KEEP row before it ships, and the doc's show-day rows are out of date (it quotes "Check the scores against the paper", which is no longer in the code, and a `/secretary/results-control` route that is now a redirect).

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

- Build `TimelineScene` and the frame data type, with both modes (autoplay and step-through) and no app dependencies. Move the capture script into the repo.
- Capture the Entries open images and regions. Replace that step in both audience stories.
- Delete `ScreenshotExplainer` and its test once nothing imports it.
- **Tests:** unit tests for frame-to-style math (region and ring to percentages), line-to-frame mapping, pause, jump, Next and Back in step-through mode (nothing advances by itself), reduced motion and "plays only in view". Render the component on the real story data, not a hand-made prop. Run the landing E2E specs.

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

## After this plan: the same scenes in the training guides and the demo deck

The owner asked on 2026-11-12 whether these scenes would make good training material. They would, and the club demo deck (MYK9-836) asks for the same thing: real screenshots, zoom on the control in use, key flows step by step. That is one component with three uses. It is not a phase of this plan, so this plan can close when the landing page ships; it needs its own issue and plan once the component exists.

Does it duplicate an existing surface? No. The written guides stay. A scene sits at the top of a guide page and the numbered steps stay beneath it.

What must differ from the landing page:

| Landing scene             | Guide scene                                                                       |
| ------------------------- | --------------------------------------------------------------------------------- |
| Plays itself and loops    | Step-through: the reader presses Next and Back                                    |
| Five lines chosen to sell | Every step of the task, including the awkward ones                                |
| Watched once              | Followed while doing the task, often on a second device                           |
| Animation only            | The plain numbered steps with still images stay underneath, for print and reading |

Rules for that work:

- **Never reuse a landing scene as a guide.** Landing scenes leave steps out on purpose. Share the component and the capture pipeline, not the frame data.
- **Not every guide page.** Each scene costs captures and measured regions and goes stale when its screen changes. Start with the core tasks per role: enter a show, accept entries, score a dog at the ring, enter paper scores, release results.
- **Same hold.** Capture only after the screens settle.
- **Guides are followed by first-timers.** Nothing autoplays, every frame has alt text, and a reader who never touches the scene loses nothing (`INTENT.md`: never makes you feel stupid).
- **The deck's own needs stay open.** MYK9-836 also asks for presenter notes and a PDF leave-behind, which the component does not provide.

### Which guide scenes get built: the ones people ask about (owner, 2026-11-12)

Scenes are built over time from real questions and support tickets, not from a list drawn up in advance. The support triage agent ([`plan-ai-support-triage.md`](plan-ai-support-triage.md), `scripts/support-triage/`) already supplies the trigger, so no new counting is needed:

- Every ticket's draft email carries a **Topic** line. When a topic has recurred three or more times and the operator's edits to its draft have settled, the operator promotes it to an entry in `CANNED_ANSWERS` (`scripts/support-triage/answers.ts`).
- **That promotion is the moment a scene earns its place.** Before writing the entry, ask in this order:
  1. **Should the screen change?** A question asked three times is evidence the UI was unclear. If a label, a control or a message would remove the question, file that and stop.
  2. **Is it in a guide?** If not, write the plain numbered steps into the guide or FAQ first.
  3. **Would a scene help?** If the answer is a sequence across screens, build the scene on that guide page.
- **Build it in the guide, link it from the reply.** The canned answer's `reply` text carries the guide link. A scene is never built inside a reply and moved later: that leaves two copies and the move does not happen.
- **The steps under the scene do double duty.** The exhibitor Q&A (`ask-myk9show`) answers from the guide corpus (`ASKQ_GUIDES`), which is text. The plain steps kept beneath each scene are what it reads, so a new guide entry can stop the next ticket before it is filed.
- **Seeded data only.** A scene shows the demo show, never the asker's show, dogs or names.

Limits to know:

- The Topic tally is the operator noticing repeats in draft emails. Nothing stores a count.
- The ticket queue is exhibitor-facing. Questions from secretaries and judges arrive by email or in person and are not in it; those are counted by hand until there is a place for them.
- Until the component and capture script exist, a scene takes about an hour to stage and measure. Answer in words or one marked-up screenshot meanwhile.

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
- MYK9-1899: on a portrait tablet the ringside entry-list header breaks after a score is saved offline; the class name wraps one letter per line.
- MYK9-1905: on the paper scoring page, "Cancel" in Card view does nothing (`SequentialView.tsx:90`).
- MYK9-1906: the paper scoring List / Card choice is saved but never read back, and every link forces the split view.
- MYK9-1907: paper scoring's "Back to Class" goes to Class Details and ignores the `returnTo` that Show Desk sends.
- Not filed, not confirmed: the "show has started" banner uses the device's date while the schedule uses the trial's timezone, so the two could disagree near midnight or for a remote secretary (`showDeskStatus.ts:56`).
- Not a bug, not filed: signed out, `/shows` lists no upcoming shows because the public list filters out demo clubs (`club.is_demo=eq.false`), and the seed show belongs to one. It matters here only for capture: the exhibitor's "Find a show" still needs a signed-in view or a non-demo fixture.
