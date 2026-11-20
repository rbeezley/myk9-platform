# Landing page: animated real-screen timeline, trust bar, pricing and FAQ (MYK9-1894)

> **Status:** Active
>
> **Hold:** do not capture a scene until the owner says its screens are settled. The scenes are captures of product screens, so capturing while those screens are still changing means capturing twice.
>
> **Lifted for the ring scene only (owner, 2026-11-17).** No unbuilt issue touches the judge's ring screens, so "Show day, at the ring" is built first. Entries open still had open work on its screens (MYK9-2155, MYK9-1965, MYK9-1935, MYK9-1930) and stayed on hold, as do the desk and Results scenes and the three stills.
>
> **Lifted for the Entries open scene (owner, 2026-11-19).** It is captured under MYK9-2296 (the discounts, MYK9-1935, are parked and are not in the scene). The desk scene left the landing page on 2026-11-20 (it moves to the guides), and the three stills stay on hold.
>
> **Lifted for the Results scene (owner, 2026-11-20).** It is captured under MYK9-2308.

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

1. Hero, keeping its photograph (owner, 2026-11-12)
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

- **Devices:** a desktop frame (5:3) and a phone frame (9:16). For the club audience the desktop leads; for exhibitors the phone leads. The other device dims while it is not the subject. A scene may have one device: the ring scene shows the judge's alone, larger (owner, 2026-11-16).
- **Frames:** each scene is a short list of frames, and each numbered line is a short heading plus one plain sentence (owner, 2026-11-16). A frame names, per device, which capture to show, the region to zoom to and an optional ring, all in the capture's own pixels. A numbered line owns one or more frames.
- **Camera:** every capture of one device shares the same camera values, so cross-fades between two states of the same screen line up exactly.
- **Regions are measured, not typed by eye.** The capture script writes each highlighted element's bounding box to a JSON file beside the scene (`src/components/landing/lifecycle/scenes/<scene>Regions.json`).
- **Controls:** Pause / Play, and each numbered line is a button that jumps to its first frame.
- **Progress:** each line's number sits in a circle. The current line's circle draws itself as its part plays, and a finished line fills in with a tick (owner's choice, 2026-11-12, over a progress bar above the line).
- **Two modes, built together.** _Autoplay_ is the landing page's: the scene plays itself and loops. _Step-through_ is for the guides and the demo deck (see "After this plan"): nothing moves until the reader presses Next or Back, and the current step stays on screen while they do it. One press of Next moves one numbered line: its frames play through, then it waits. Back replays the previous line (owner, 2026-11-16). Same frames, same camera, same data shape.
- **No app dependencies.** The component takes data and images and nothing else: no auth, no replication, no router. The guides site (`apps/docs`) is a separate project and must be able to use it.
- **Plays only while in view**, and stops when the tab is hidden.
- **Reduced motion:** the finished frame is shown and nothing moves. Pressing a line shows that line's last frame.
- **No scroll-jacking.** The page scrolls normally at all times.
- **Complete at rest:** the first frame is a full, readable scene before any script runs.

### Which steps get a scene

Six full scenes would make a very long page. Three steps sell the product and get the full treatment; the other three are one still and one line each.

| Step            | Treatment | Notes                                                                                |
| --------------- | --------- | ------------------------------------------------------------------------------------ |
| Set up          | Still     | Create Show wizard                                                                   |
| Entries open    | Scene     | Prototyped; flow below                                                               |
| Before show day | Still     | Keeps `NightBeforeCard`                                                              |
| Show day        | Scene     | At the ring (judge). The desk scene moved to the training guides (owner, 2026-11-20) |
| Results         | Scene     | Secretary releases; exhibitor's phone shows the placement                            |
| After           | Still     | Dog's record                                                                         |

### The "Entries open" scene (re-verified in code 2026-11-15)

The exhibitor's phone and the secretary's screen share one scene. The words live in `SCENE_LINES.entries` (`lifecycleStories.ts`); each line's code evidence is in the "Timeline scenes" section of [`qa/landing-lifecycle-evidence.md`](qa/landing-lifecycle-evidence.md).

1. **An exhibitor enters online.** They pick a dog and their classes. A full class says so, and they can only join its waiting list if you allow one.
2. **They pay as they enter.** They pay by card at a secure checkout, or by check or cash at the show if you turn those on.
3. **They can see where it stands.** Their entry reads Pending review until you decide.
4. **The form arrives in your list.** It is marked Needs review, with the payment shown beside it.
5. **You open it and accept.** One button. Their entry changes to Accepted and they get an email.

Changed from the 2026-11-12 wording:

- The wizard is no longer "four steps" for every payer. Card goes straight to Stripe from the Payment step ("Pay $X.XX", MYK9-1964), so only check and cash reach the Receipt step. The exhibitor's wizard still has no Handlers step (the secretary's does); a handler question appears inline only when one owner enters two dogs in one class (MYK9-2021).
- "Full: join waitlist" cannot be quoted: `BANNED_COPY` forbids the word. Line 1 says a full class "says so" and names the "waiting list" (2026-11-19, MYK9-2296; a full class with no waiting list reads "Full" and cannot be entered, one that allows a waiting list reads "Full: join waitlist" and can).
- **Line 2 reworded 2026-11-19 (MYK9-2296).** Card is now the first method and check and cash are off unless the club turns them on (MYK9-2164), so the line leads with card. The card checkout is Stripe's own page and the capture job has no outbound network, so line 2's frame is the wizard's Payment step with "Pay $X.XX" and the card chosen, never pressed.
- **The scene as captured (MYK9-2296).** The capture sets up the job's own database before the walk (`capture/landingEntriesSetup.sql`, run by the spec through psql after it has checked the target is on this machine): the demo seed's entries, forms and armbands at the show are removed (refunds, withdrawals and a paid multi-dog order are test fixtures, not what a club sees), the club's contact becomes a reserved-domain address, the show-day fixture is renamed, and the second demo exhibitor (Riley Parker, `exhibitor2@`, who has no entries) gets two dogs. Tessa is already entered in the class that holds one dog (so it reads Full for Piper); that is the form Piper's entry joins. The walk enters Piper in Buried Novice A and pays by check, so the entry is really submitted. The secretary's row is that form, going from Accepted to Needs review, and the open form lists the review, the payment and "Piper has no armband" (an online entry assigns none); one Accept accepts only Piper, and the desk frame keeps the form's "No decision email sent yet" line out of the camera.
- "The panel reads 'All set.'" is true only when nothing else is open. A form with an unpaid fee or a dog with no armband still lists those items. Stage a form with both done.
- **"Accepting sends no email" is no longer true.** On a published show that has not finished, Accept emails the exhibitor by itself after a few quiet minutes; on other shows the secretary sees a preview first. Line 5 now says so in words (owner, 2026-11-16): no email capture and no sixth step. Stage the scene on a published show that has not finished.

Facts the copy must respect:

- Paying does not accept an entry, and an unpaid entry can be accepted.
- The secretary's list shows no class-limit figure. The limit is enforced when the exhibitor enters.
- Armbands are not assigned by an online entry; a staff member assigns them.

### Show day has two scenes (owner, 2026-11-12)

The judge is a key role and works almost entirely in Ringside, and the secretary has her own show-day screens, including typing results in from paper when tablets are not used. Show day therefore carries two scenes, one after the other, inside the one step. It does not add a third audience to the switch: judges do not choose the software.

Do not capture the desk scene until the page fixes are finished. Its lines are written and checked now; the screens are among those most likely to change.

### The "Show day, at the ring" scene (re-verified in code 2026-11-15)

One device: the judge's, shown larger, with no dimmed desk beside it (owner, 2026-11-16). The desk scene that follows shows the scores arriving. Words in `SCENE_LINES['showday-ring']`.

1. **The judge opens the ring's classes.** Each class shows how many dogs are scored.
2. **The signal drops.** The screen says changes are saved on this device, and the run order stays.
3. **The judge times and scores the run.** Start, Stop, then Qualified, NQ, Absent, Excused or DQ.
4. **The score is read back before it saves.** The judge checks the dog, the result and the time, then confirms.
5. **The signal returns.** The saved score sends itself, and the screen says Scores sent.

Changed from the 2026-11-12 wording (the judge's flow changed on 2026-11-14, MYK9-2012, MYK9-1991, MYK9-2011):

- Line 1 said "how many dogs are left". The card shows a scored count; "remaining" only appears on a live class.
- Line 2's frame comes before any score is saved offline. On a phone it is the message "You're offline. Changes are saved on this device and will be sent when you are back online."; from 640px up the header reads "Offline · scores saved on this device", and after the first offline score "Offline · 1 score not sent yet".
- Line 4 said the tablet says "Saved on this device. It will send when you're back online." That is gone: after Save the judge is back on the entry list with the "Saved:" line and a "Correct" button.
- **Line 5 (the exhibitor's My Entries row shows "New result") was wrong and is replaced.** "New result" appears only after the club releases a Qualified result, so it belongs to the Results scene. The ring scene has no second device after line 1; the exhibitor phone is the second device in the Results scene. If a phone frame is wanted here, the only honest one is the dog's "In ring" chip after Start, and it needs the tablet online, so it does not fit an offline scene.
- The "Time" and "Resume" pills on the class cards, the Saved screen and the next-dog chips are gone. The app never picks the next dog.

Facts the copy must respect:

- Scoring is not gated on the date. The exhibitor's "Show day is here" banner is, and by the server's clock, so it cannot be staged by changing a browser clock.
- While the judge's device is offline the exhibitor's phone does not change.
- There is no auto-advance after a score. The judge chooses a dog from the list.
- The reconnect ("Scores sent") is real: the capture's database is the job's own, so the score is really sent when the signal returns and the phone shows what a judge sees.
- **The scene is the judge's phone, captured 390 wide (owner, 2026-11-18; MYK9-2181).** Lines 2, 4 and 5 and the show-day step's own sentence were reworded for it (the owner has not yet read the new wording): line 4 now ends at the read-back and line 5 opens on the saved list, so each line's text is what its frames show; the step says judges score "on a phone or tablet"; on a phone the header shows an amber no-signal icon and a message says "You're offline. Changes are saved on this device…", where a wider screen prints "Offline · scores saved on this device" in the header; and line 5 says "the screen", not "the tablet".
- **The scene is Juni (102) in Exterior Excellent**, not Cooper in Container Novice A. On the seed as an isolated stack holds it, Container Novice A is complete with its results released, and Exterior Excellent is the judge's unscored class with a single timer. The capture's database is seeded without the load fixture, so the class holds the demo seed's one dog and reads 0 of 1 scored.
- Per-judge access codes now scope each code to that judge's classes (MYK9-1950). Sign-in is not a line in this scene.

### The "Show day, at the desk" scene (re-verified in code 2026-11-15, not captured)

> **Not on the landing page (owner, 2026-11-20).** The ring scene already tells show day, and check-in at the desk is detail a club needs once it has signed up, so this flow goes to the training guides (see "After this plan") instead. Kept here as the verified flow for that work.

The secretary's screen leads. The second device is the judge's tablet for lines 1 to 3. For line 4 there is no second device: the paper score sheet is the other half of the picture, so that frame needs a different treatment (a printed Score Sheet beside the screen). Words in `SCENE_LINES['showday-desk']`.

1. **Your day is on one page.** Each class says where it stands, like 3 of 5 not checked in.
2. **Check in at the desk.** Find an exhibitor by name, dog or armband and check in each dog.
3. **Watch the classes run.** A running class shows how many dogs are scored and who is in the ring.
4. **No tablets? Type in the paper scores.** The dogs are listed in run order. Pick the result, type the time, save and move on.
5. **Mark the class complete.** It asks first if paper scores are missing, then takes you to Results.

Changed from the 2026-11-12 wording:

- The Check-in desk is a tool in the header Actions menu that opens Entry Forms' Check-in desk, not a Show Desk panel. Its search box reads "Search name, dog, armband".
- Line 4's result buttons are Q, NQ, ABS, EX and DQ (the paper page's own labels), and the time field is "Search Time".
- The heading reads "Show schedule" on a day that is not today, so the scene must be staged on a trial day.

Facts the copy must respect:

- Show Desk updates when a tablet syncs, not continuously. Not re-verified in code on 2026-11-15; no line claims otherwise.
- Paper scoring saves one dog at a time with "Save" or "Save & Next", and writes to the device first. Not re-verified, so not used: that Enter does not save, that "12345" means 1:23.45, and that a self check-in looks the same as a staff one.
- The "Ready for show day" checklist belongs to the Before show day step.
- Checking, releasing and the judge's initials happen on the Results tab. They belong to the Results step, not here.

### The "Results" scene (verified in code 2026-11-15)

The secretary's screen leads; the exhibitor's phone is the second device for line 4. Four lines: releasing several classes at once is left out of the scene (owner, 2026-11-16) and can go in the guide and the demo deck. Words in `SCENE_LINES.results`.

1. **A finished class is waiting for you.** The Results tab lists it with what to do next: check the scores.
2. **The placements are worked out.** Open the class to see them, ranked from the scores.
3. **You release the results.** One press. The class reads Released and exhibitors can see their scores.
4. **The exhibitor sees it on their phone.** My Entries shows New result on the dog's class, and it opens the result card.

Facts the copy must respect:

- Release works online only, and the check it saves needs the class marked Complete first.
- "New result" appears only for a Qualified result in a released class. Stage the dog as Qualified.
- What an exhibitor sees still follows the show's visibility settings. The club story's existing "the moment you release it" is not claimed by any scene line; revisit it in Phase 2.

## Capturing the screens

- **A capture is safe by where it runs, not by sorting its requests** (owner, 2026-11-18; MYK9-2181). A first version let the app talk to a backend through a guard that told reads from writes, one RPC from another and one armband from another; two review rounds kept finding gaps in it, so it was replaced. The ring captures of 2026-11-17 were taken against the production project by hand-run scripts (about a dozen judge sign-ins, no writes, and the fixture judge shown as scoring through show presence); the committed capture cannot do that.
- **The database is the job's own.** The **Landing capture** workflow (`.github/workflows/landing-capture.yml`) builds a disposable Supabase stack, seeds it from the repository's demo seed only (`MYK9_E2E_LOAD_FIXTURE=false` leaves the 63-dog load fixture out), and destroys it with the job. The stack's accounts get passwords the job makes for itself; the repository's fixture passwords, which also open the fixture accounts on the hosted project, are never given to it. Every row is a fixture, so nothing is filtered, and the walk scores for real: the reconnect really sends the score.
- **Nothing the capture runs can leave the runner.** After install, build and the font download, the job closes the outbound network for the capture's processes (the browser, the preview server and the spec run in a group that may open connections to this machine only; names are still looked up by the system resolver, and the stack's own containers are outside the rule, as in every isolated job). A control proves the probe connects before the rule and is refused under it, and the spec proves the refusal again before it signs in.
- **The capture is one spec per scene in the isolated e2e suite**: `apps/myk9show/src/test/e2e/capture/landingRingCapture.spec.ts`, `landingSceneEntriesCapture.spec.ts` and `landingSceneResultsCapture.spec.ts` (the ring runs first and the Results capture last; the names sort so), run by `playwright.ci.config.ts` when `PLAYWRIGHT_LANDING_CAPTURE=true`. It uses the suite's own sign-in, isolated-target check and production-bundle check, and refuses to start unless it is in the workflow, the target is isolated, the built bundle is there and does not name the production project, `MYK9_ALLOW_PROD_E2E` is not set, and the network is closed (`captureStartProblem`, tested). Every other Playwright config skips it. Beside them: `captureKit.ts` (the measuring and socket-hold code the specs share), `egressProbe.ts` (the network proof), `downloadFonts.ts` (the app's web fonts, fetched before the network is closed and served to the page from disk) and `helpers/landingCapture.ts` (tested in `src/test/e2e-helpers/landingCapture.test.ts`).
- **No WebSocket is connected to any server.** Every socket the page opens is held in the browser; the spec's first test proves it, with a control.
- **Where it runs.** In the workflow only: on a pull request that changes the capture, or on demand (`gh workflow run landing-capture.yml`). The owner's Windows PC cannot run the stack (no Docker, and the Supabase CLI answers "Native artifacts are unsupported on win32/x64"). The run uploads the images and regions of every scene as the `landing-capture` artifact, laid out to unpack over a checkout. Commit the artifact's files; the workflow commits nothing.
- **Staging.** "No signal" is staged for the backend only (the page keeps the code it has loaded): `navigator.onLine` follows a flag and backend requests are dropped while it is set. Nothing else is staged.
- Each scene writes its images (`public/landing/scenes/<scene>/`) and its measured regions (`src/components/landing/lifecycle/scenes/<scene>Regions.json`) into an empty output folder, laid out as in the repository, never over the checked-in copies. The job uploads only when every file is there, so an artifact is always one whole run. The spec also requires a loaded face of the app's body font before the first shot.
- Captured on the canonical seed show (Heartland Scent Work Classic, `dededede-0000-0000-0000-000000000010`), signed in as a seeded account.
- Desktop captures at 1440×900. Phone captures, the judge's screen in the ring scene included, at 390×844 at 2× density.

## Phases

Each phase ends with its own checks passing. One pull request per phase.

### Phase 0: decisions and inventory (done 2026-11-15)

- The owner's four decisions are recorded under "Decisions".
- The Entries open, Show day (ring and desk) and Results flows are re-verified against `main` @ `5aa15d760`, and each scene's numbered lines are written above and in `SCENE_LINES` (`lifecycleStories.ts`). Nothing renders them yet; the live timeline is unchanged.
- Every line has a KEEP row in the evidence doc.
- **Tests:** `lifecycleStories.test.ts` covers the new lines (a heading and a sentence each, five per scene and four for Results, none repeated) and runs them through `BANNED_COPY`.
- The frame shape (capture, region, ring per line) is not added yet: it needs the captures, so it arrives with Phase 1.

### Phase 1: the scene component, the ring scene, then the Entries open scene

Reordered on 2026-11-17: the ring scene goes first, because its screens are settled and the Entries open screens are not.

- Build `TimelineScene` and the frame data type, with both modes (autoplay and step-through) and no app dependencies. Done (#4008).
- **Ring scene (built 2026-11-17, re-captured at phone width 2026-11-18, MYK9-2181).** The capture is in the repo as an isolated e2e spec (`apps/myk9show/src/test/e2e/capture/`, see "Capturing the screens"). The screen is the judge's phone, 390×844 at 2× density, so the words read at the 235px the page draws it on a phone; the label and alt text say phone. Line 1's ring is the whole class card. **The frame stays 3:4**, the shape it had as a tablet: a whole phone in the frame made the club page 15.15 phone screens long, over the limit of 15, so each frame is a window the phone's full width and 520 tall, placed on its ring by one rule (`windowOnRing` in `sceneFrames.ts`, tested) and never zoomed. One frame is about two things, the stopped time and the result, so its window is placed on both measured regions together. The club page stays 14.9 screens. The other way to fit a whole phone is to raise the limit, which is the owner's call. Under reduced motion each line rests on the frame its heading names: the read-back closes line 4 and the saved list opens line 5 (`ringScene.test.tsx`). "Show day, at the ring" plays on the show-day step: in the club story above the practice scoresheet, and in the exhibitor story on the meanwhile side, where the judge's still (`j-04.png`, deleted) was. Eight captures, nine frames. **The ring scene does not zoom:** every frame is the screen at its full width with a ring. The first capture was a tablet, 768 wide, which the page draws 235 wide on a 375px phone, so a camera close enough to read cropped whatever sat beside it, and four review rounds traded one for the other. The two limits the owner accepted on 2026-11-18 (words too small to read on a phone; line 4 resting on the saved list under reduced motion) are both closed by the phone-width re-capture.
- **Phone page length (owner, 2026-11-17):** the scene adds about one phone screen. At 390×844 the club page is 14.9 screens and the exhibitor page 14.0, so the limit in `landing-lifecycle.spec.ts` is raised from 14 to 15 and nothing is taken off the show-day step. **Update (owner, 2026-11-19, MYK9-2295):** the meanwhile screenshots are dropped now, before the Entries open scene, instead of in Phase 2; each step keeps its own main screenshot and the meanwhile column keeps its sentence (and the exhibitor show-day ring scene). This took the club page from 14.90 to 12.91 screens and the exhibitor page from 14.02 to 13.31 at 390×844. The limit stays 15, not 14, so the Entries open scene (MYK9-2296) has room. The club page had 0.1 of a screen to spare, so the next scene could not fit until this landed.
- **Entries open scene (built 2026-11-20, MYK9-2296).** Nine captures (five of the exhibitor's phone at 390×844 at 2×, four of the secretary's desktop at 1440×900), seven frames, from the same isolated workflow and under the same safety rules as the ring scene (a second spec, `landingSceneEntriesCapture.spec.ts`, after the ring's; one artifact, `landing-capture`, with both scenes' files, all or nothing). It replaces the Entries step's still in both stories: the club's `s-07` and the exhibitor's `e-02` with its explainer, both deleted. The club leads with the desk and the exhibitor with the phone, on the same five lines (`TimelineStep` passes the lead). The phone frames are the ring scene's 3:4 windows (`windowOnRing`); the desk frames are 5:3 zooms 640 wide on a ring (`zoomOnRing`, tested), widened and never cropped when a ring is wider. Under reduced motion each line rests on the frame its heading names (`entriesScene.test.tsx`). Phone page length at 390×844 is 14.22 screens (club) and 14.45 (exhibitor), under the limit of 15, up from 12.91 and 13.31.
- `ScreenshotExplainer` stays: the exhibitor's show-day step still plays an explainer on `e-13` (Phase 2 retires it with the Show day scene). Only the Entries explainer data and its still went.
- **Tests:** unit tests for frame-to-style math (region and ring to percentages), line-to-frame mapping, pause, jump, Next and Back in step-through mode (nothing advances by itself), reduced motion and "plays only in view". Render the component on the real story data, not a hand-made prop. Run the landing E2E specs.

### Phase 2: the Results scene and the three stills

**Owner decision (2026-11-20): one more scene, not two.** After the Entries scene the phone page is 14.22 screens (club) and 14.45 (exhibitor) against a limit of 15, and each scene adds about 1.3. The options were raising the limit, shortening scenes, or dropping one. Chosen: drop the desk scene from the landing page (it moves to the guides), build the Results scene, and raise the phone page-length limit from 15 to 16 for it. Shortening scenes was rejected: fewer frames leave a line without its screen, and smaller frames bring back the unreadable phone text the ring scene was re-captured to fix. The three stills stay.

- **Results scene (built 2026-11-20, MYK9-2308).** Seven captures (three of the exhibitor's phone at 390×844 at 2×, four of the secretary's desktop at 1440×900), six frames, from the same isolated workflow and under the same safety rules (a third spec, `landingSceneResultsCapture.spec.ts`, last of the three; run 44803226698 produced the committed images, 27 files in all). Its setup (`capture/landingResultsSetup.sql`, run through psql after the target is checked) starts the show over and stages one finished class, Container Novice A: Piper (Riley Parker's dog, the one the Entries scene follows) first and Qualified, Willow and Cooper behind her, the class marked Complete, nothing checked or released, the show's results visibility set to After Review (so the exhibitor's phone shows no result until the release), and the exhibitor's "Show your results publicly?" prompt already answered so it is in no frame. The walk is real: the secretary folds the shows list (Hide), opens the class and presses Release results once, online, and the exhibitor's phone, reloaded, shows New result and then the card. It replaces the Results step's still in both stories: the club's `s-20` and the exhibitor's `e-17`, both deleted (nothing else used them). The club leads with the desk and the exhibitor with the phone, on the same four lines. Under reduced motion each line rests on the frame its heading names (`resultsScene.test.tsx`). **Line 3 re-verified after MYK9-2072 (bulk release):** "One press" still holds, because the class page's one Release results button checks and releases in one go; the confirm dialog belongs to the tick boxes, which the scene does not show. No line was reworded. The phone limit in `landing-lifecycle.spec.ts` is now 16 (owner, 2026-11-20): phone page length at 390×844 is 15.02 screens (club) and 15.27 (exhibitor), up from 14.22 and 14.45.
- Capture and wire the three stills. Remove the old two-column layout and its CSS. (The Results scene is built, above.) **Done in part (MYK9-2295, owner 2026-11-19):** `meanwhileShot` and its CSS are gone; the meanwhile column is a sentence, or a scene where one is wired. Still to do here: the three stills and the rest of the two-column layout (MYK9-2309).
- **Tests:** as Phase 1 for the new scenes. Assert rendered geometry at 390px and 1280px (no horizontal overflow, devices stack on the phone). Shuffled full-suite run.

### Phase 3: hero, trust bar, pricing, FAQ (trust bar, pricing and FAQ built 2026-11-16)

Built ahead of the scenes because none of it needs a capture. What changed from the bullets below: the pricing section prints the live rate (the same read as `/fees`) and links to `/fees` for the split, so no figure is written in the copy; each FAQ question opens in place (six open answers broke the phone page-length budget in `landing-lifecycle.spec.ts`); "trying it first" is answered plainly (the practice scoresheet and a free draft show, no demo mode). Still to do in this phase: the hero LCP check, and the club recount before the trust bar ships.

- Hero keeps the photograph; no scene and no motion there. Check mobile LCP against [`plan-landing-hero-lcp-prerender.md`](plan-landing-hero-lcp-prerender.md) before and after, since the page below it gets heavier.
- Trust bar: the four claims in "Decisions", plus the club count when its source is found. Fold in or replace `TrustSection`; do not keep both.
- Pricing section with the wording in "Decisions". First confirm in code whether a check or cash entry carries any fee, and read the real card rate from Stripe.
- FAQ: the six questions in "Decisions", each answer verified in code and given a KEEP row. One whose honest answer is "not yet" is dropped or answered plainly.
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
- **Not every guide page.** Each scene costs captures and measured regions and goes stale when its screen changes. Start with the core tasks per role: enter a show, accept entries, check in at the desk (the verified flow under "Show day, at the desk", moved off the landing page on 2026-11-20), score a dog at the ring, enter paper scores, release results.
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

## Decisions (owner, 2026-11-16)

Walked one at a time and recorded on MYK9-1894.

1. **Fee wording:** 7%, as charged. See decision 1 of 2026-11-12 below for the confirmed line.
2. **Line format:** a short heading plus one plain sentence, written to the secretary ("your list", "you open it and accept"). The capture shows the app's labels, so the words do not quote them.
3. **Acceptance email:** said in words on the last Entries line.
4. **Results scene:** four lines; releasing several classes at once is left out.
5. **Ring scene:** one device, the judge's, shown larger.
6. **"More than 200 clubs":** kept, recounted before the page ships, "About 200" if the recount is under.
7. **Step-through:** one press of Next moves one numbered line.

Still open: the lines are written to the club, the default audience. When Phase 1 puts the Entries scene in both stories, decide whether the exhibitor audience reads the same words or its own ("you" is the secretary in every line today).

## Decisions (owner, 2026-11-12)

All four were open when this plan was written. They are settled.

1. **Pricing: state it plainly, numbers included.** Pricing was already decided and built: the cart charges the exhibitor "Service fee (7% + $0.30, $2.50 minimum)" on top of the entry fee when paying online, and the club pays nothing ([`goals/business-model-assessment.md`](goals/business-model-assessment.md) § 5). The platform pays card processing out of that fee (about 2.9% + 30¢ of the whole charge, up to 3.5% on some cards), which leaves roughly half ([`operations/unit-economics.md`](operations/unit-economics.md)). The owner does not want the page to read as if myK9Show keeps 7%. Wording to start from:

   > ~~Free for clubs, and the club keeps the full entry fee. Exhibitors pay a service fee when they enter online: 7% + $0.30 ($2.50 minimum). About half of it covers card processing; the rest keeps myK9Show running.~~

   **Superseded on 2026-11-16.** The fee charged today is 7% with no flat part and no minimum (`platform_settings`: 7.00% / 0¢ / 0¢), and "about half covers card processing" was not accurate. The owner chose to state the fee as it is charged. Wording, confirmed by the owner:

   > Free for clubs, and the club keeps the full entry fee. Exhibitors pay a 7% service fee when they enter online. It covers card processing and keeps myK9Show running.

   If the fee settings change, this line changes with them; the pricing work adds a check that the stated figure matches `platform_settings`.

2. **Trust bar: four claims, plus one number.** The claims: scent-sport software since 2013; AKC, UKC and ASCA scent work; scores at the ring with no signal; from the team behind mySWT, myNWT and myK9Q. The number: **"More than 200 clubs run their trials on mySWT and myNWT."** No testimonials, club names or logos.

   Where the number comes from: the owner's WooCommerce licence-key export of 2026-10-25 (413 active keys), counted on 2026-11-12. Leaving out free demos and keys expired since the export, 280 paid mySWT or myNWT subscriptions are held by 211 customers (mySWT 247 keys, 185 customers; myNWT 33 keys, 32 customers). The customer on a key is a person, not a club, and 27 of them hold two or more keys of the same product, which the file cannot split into second clubs, early renewals and second computers. So the customer count is the floor and the claim is "more than 200", the owner's choice. The export holds names and emails: it stays out of the repo, and the count is redone from a fresh export before the page ships. If the recount is under 200 the line becomes "About 200 clubs…" (owner, 2026-11-16).

3. **FAQ: all six questions.**
   - Ready to answer: Does it work with no signal? (Scoring at the ring does and sends itself later; entries, payments and sign-in need a connection, and the answer says so.) Which registries and sports? What does it cost?
   - To verify in code before writing: How do results get to the registry? What does switching involve? Can we try it before a real show?

4. **Hero: keep the photograph.** "The software disappears so the dogs can shine": the first thing a dog person sees is a dog working. No scene and no motion in the hero; the scenes begin at the timeline. This reverses the looping-scene idea in the first draft of this plan.

## Found while verifying the flow

Product-screen observations, outside this plan's scope. Filed 2026-11-12 at the owner's request.

Status on 2026-11-15, from `git log` on main: MYK9-1898, MYK9-1899, MYK9-1905, MYK9-1906 and MYK9-1907 have fix commits (#3851, #3820, #3836). MYK9-1896 is no longer visible in the code: the checkout success page says "confirmed" only when every entry is accepted. The issue states of MYK9-1895 and MYK9-1897 were not read; only the code was.

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
