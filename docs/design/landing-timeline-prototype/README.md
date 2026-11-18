# Landing timeline prototype (MYK9-1894)

Reference material for [`docs/plan-landing-animated-timeline.md`](../../plan-landing-animated-timeline.md). Not production code.

The approved prototype page for the "Entries open" step is linked from the Linear issue (a private artifact).

The committed capture scripts are in `apps/myk9show/scripts/landing-capture/` (`lib.ts` and one script per scene, the ring scene first). They replace the prototype's `capture.cjs` and `lib.cjs`, which stayed on the machine that built the prototype and are not committed: they hard-code a Windows path, use the installed Edge, and their write guard let every RPC through. `entries-open-prototype.html` is also uncommitted; the approved page is the artifact linked from the issue.

How the capture works, for whoever rebuilds it:

- Sign in on `localhost` as the seeded secretary and exhibitor and open the canonical seed show.
- Block every write to the data API, so a capture run cannot change shared data.
- Stage one seeded entry in three states (not there yet, needs review, accepted) by patching the responses the browser receives. The rows come from `view_authenticated_entry_results_replication` on the secretary's list and `view_authenticated_entry_results` on My Entries.
- Use a fresh browser context per state, because the app caches rows locally.
- Record each highlighted element's bounding box, so zoom regions and rings are measured.
