# MYK9-80: Podium + Class Completion Celebration

> **Status:** Active

## Goal

Add a podium presentation and a one-time class-completion celebration to the existing `/at-show` entry list Completed tab. This does not add a page, route, or duplicate results surface.

## Verified constraints

- The shared presentation seam is `packages/ringside/src/pages/EntryList/EntryListPage.tsx`.
- `/at-show` supplies offline-first entries and class metadata through `atShowDataAdapter.ts`.
- The scoresheet route unmounts the entry list, so a plain in-memory false-to-true detector would miss the final-score transition after navigation.
- `ReplicatedClass` already carries server-authoritative `resultsReleasedAt`, `actual_start_time`, and `actual_end_time`.
- `ReplicatedEntry` already carries scoring and ring timestamps for an offline fallback.
- Placement values are server-authored and already mapped onto ringside entries.
- `no-status` remains expected and unaccounted until show staff records an explicit
  terminal outcome such as absent or excused; the client does not infer no-shows.

## Duplication question

Does this duplicate an existing page? No. The podium is a view state at the top of the existing Completed tab, matching the issue's explicit consolidation requirement. The existing public results surfaces remain canonical outside ringside.

## Implementation

1. Extend the ringside class/entry display contracts with the existing release and timing fields.
2. Map those fields from the replication-backed `/at-show` adapter.
3. Add a shared `ClassPodium` component that renders released 1st–4th placements using host theme tokens plus the existing gold, silver, and bronze medal accents.
4. Add shared completion-intent storage and a celebration hook/component:
   - the scoresheet records intent only when fresh replicated snapshots confirm the submitted entry was the final expected, unaccounted entry and the class became accounted-for;
   - the entry list consumes intent only after server-authoritative finalization and `resultsReleasedAt` exist;
   - pending intent expires after 24 hours so a later revisit cannot hijack the
     selected tab or trigger delayed confetti;
   - a persistent per-class celebrated flag prevents revisit and sync replay;
   - reduced-motion users receive the summary without confetti.
5. When the valid completion intent is consumed, select the Completed tab and layer a dismissible summary over the podium.

## Testing

Use the issue's public seams:

- `EntryListPage` / Completed tab:
  - fully scored + released renders 1st–4th podium;
  - unreleased renders neither podium nor celebration;
  - a pending final-score intent opens the summary once and selects Completed;
  - remount/revisit keeps the podium but does not replay celebration;
  - reduced motion suppresses confetti.
- `/at-show` scoresheet:
  - successful submission of the only remaining unscored entry records completion intent;
  - non-final submissions do not record intent;
  - failed submissions do not record intent.
- Adapter:
  - release and timing fields map from replicated class/entry rows without direct Supabase reads.

Run focused tests during red/green cycles, then package/app typechecks, changed-file lint, the full ringside suite, and the relevant `/at-show` tests. Stop any hanging suite after 60 seconds.

## Non-goals

- No new route or public results page.
- No placement calculation or release mutation.
- No secretary-surface implementation.
- No changes to result visibility policy beyond honoring the existing server release timestamp.
