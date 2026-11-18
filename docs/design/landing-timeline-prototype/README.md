# Landing timeline prototype (MYK9-1894)

Reference material for [`docs/plan-landing-animated-timeline.md`](../../plan-landing-animated-timeline.md). Not production code.

The approved prototype page for the "Entries open" step is linked from the Linear issue (a private artifact).

The capture scripts are committed in `apps/myk9show/scripts/landing-capture/` (MYK9-2181): the safety rules in `guardRules.ts`, their wiring in `guard.ts`, `lib.ts`, a self-check and one script per scene, the ring scene first. They run against an isolated Supabase stack only, through the Landing capture workflow; see "Capturing the screens" in the plan. They replace the prototype's `capture.cjs` and `lib.cjs`, which stayed on the machine that built the prototype and are not committed: they hard-code a Windows path, use the installed Edge, and their write guard let every RPC through. `entries-open-prototype.html` is also uncommitted; the approved page is the artifact linked from the issue.

How the prototype's capture worked, kept for the Entries open scene, which is not captured by a committed script yet:

- Sign in on `localhost` as the seeded secretary and exhibitor and open the canonical seed show. A rebuilt script does this through `lib.ts` and the guard, against an isolated stack, never as the prototype did.
- Block every write to the data API, so a capture run cannot change shared data.
- Stage one seeded entry in three states (not there yet, needs review, accepted) by patching the responses the browser receives. The rows come from `view_authenticated_entry_results_replication` on the secretary's list and `view_authenticated_entry_results` on My Entries.
- Use a fresh browser context per state, because the app caches rows locally.
- Record each highlighted element's bounding box, so zoom regions and rings are measured.
