# Landing timeline prototype (MYK9-1894)

Reference material for [`docs/plan-landing-animated-timeline.md`](../../plan-landing-animated-timeline.md). Not production code.

The approved prototype page for the "Entries open" step is linked from the Linear issue (a private artifact).

Three working files sit in this folder on the machine that built the prototype and are **not committed yet**, because the docs-only path to `main` takes Markdown only. They go in with the Phase 1 pull request:

- `entries-open-prototype.html`: the prototype page. It expects its captures in an `img/` folder beside it.
- `capture.cjs` and `lib.cjs`: capture the real screens from a local dev server.

How the capture works, for whoever rebuilds it:

- Sign in on `localhost` as the seeded secretary and exhibitor and open the canonical seed show.
- Block every write to the data API, so a capture run cannot change shared data.
- Stage one seeded entry in three states (not there yet, needs review, accepted) by patching the responses the browser receives. The rows come from `view_authenticated_entry_results_replication` on the secretary's list and `view_authenticated_entry_results` on My Entries.
- Use a fresh browser context per state, because the app caches rows locally.
- Record each highlighted element's bounding box, so zoom regions and rings are measured.
