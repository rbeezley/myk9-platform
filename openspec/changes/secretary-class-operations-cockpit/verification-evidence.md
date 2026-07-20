# Secretary Class Operations Cockpit Verification Evidence

Date: 2026-07-20

## Focused automated coverage

- `paperworkPrintsAuthorization.source.test.ts` pins authenticated Show-manager read/insert/void policies, actor identity checks, restricted update grants, denial scenarios, append-only facts, and rollback behavior.
- `ReplicatedPaperworkPrintsTable.test.ts` covers offline local persistence plus replay payload, stable client ids, append-only concurrent confirmations/reprints, void-only corrections, and preservation of two secretaries' records.
- `paperworkPrintState.test.ts` covers broad Trial coverage, per-subject staleness, document-specific relevant and irrelevant changes, Class-only reprint precedence, void fallback, and truthful `unconfirmed` state.
- `ShowDeskPanel.test.tsx` covers attention deep links and return context, deliberate focus, filters, Trial collapse summaries, canonical ordinary-work labels, permissions, and both responsive focus projections.
- `SecretaryCockpitFocusedClass.test.tsx` covers explicit confirmation, Undo, truthful `Not confirmed printed` copy, stale broader-scope evidence, actor/time, Review and reprint, and append-only history.
- `ClassOperationalControls.test.tsx` covers completion confirmation with unentered paper scores and separate cancellation.
- `ShowDeskCompactContext.test.tsx` covers resolving publish exceptions plus calm offline and pending local-save copy.

Focused result: 10 files and 44 tests passed. App typecheck, lint, production build, strict OpenSpec validation, and `git diff --check` also passed. The build retained the repository's existing CSS-minifier and mixed static/dynamic import warnings.

The behavioral RLS script remains at `supabase/tests/paperwork_prints_rls_test.sql`. The local Docker-backed Supabase stack was unavailable for execution during this walk, so the focused source contract and previously applied linked migration are the local permission evidence; the transactional SQL test should also run in CI or an available local stack.

## Browser evidence

### Concurrent scent-work orientation

- Desktop fixture: `.playwright-cli/cockpit-scent-fixture-desktop.png`
- Snapshot: `.playwright-cli/page-2026-07-20T15-39-57-024Z.yml`
- Verified two Trials and five Classes with named/multiple Search Areas; visible states included Not started, In progress, Complete, missing paper scores, move-up review, closeout, not-confirmed paperwork, and stale Result Labels.
- The Needs attention strip named the resolving action while the schedule remained in Trial/time order.

### Production desktop and landscape tablet

- Desktop: `.playwright-cli/cockpit-desktop-all-online.png`
- Landscape tablet: `.playwright-cli/cockpit-landscape-online.png`
- Verified compact Show context, status and sync copy, schedule-owned filters, stable Trial summary, focused Class work, and Paperwork actions.
- At 1180×820 the inline focus projection was visible, the split projection was hidden, and every visible cockpit button/link measured at least 44×44 px.

### Production portrait tablet and return context

- Portrait: `.playwright-cli/cockpit-portrait-online.png`
- Offline filtered focus: `.playwright-cli/cockpit-portrait-offline-filtered.png`
- Verified exactly one visible inline focused Class at 768×1024 and no visible cockpit target under 44×44 px.
- Selecting Container Novice changed the URL-backed focus. `View entries and results` opened the canonical Class route with encoded Show Desk return context; `Back to Show Desk` restored the same focused Class.
- Filtering an out-of-filter focused Class now preserves the focused work panel below the schedule with `Focused Class is outside the current schedule filter.`

### Offline and two-secretary coordination

- Production offline: `.playwright-cli/cockpit-portrait-offline-live.png`
- Two-secretary fixture: `.playwright-cli/cockpit-two-secretary-offline-fixture.png`
- With an already-open production page taken offline, the schedule, filters, and focus remained usable and the compact context changed to `Offline · changes saved on this device`.
- The fixture identified two secretaries working, showed `Saved on this device`, attributed print evidence to Jamie and Alex with times/scopes, exposed history, and identified one-Class staleness after a broader print.
- Offline console network failures were expected for Supabase/WebSocket, font, and favicon requests in the dev harness; cached cockpit interaction remained available.

## Remaining release gates

- Two real devices/accounts and shared replicated writes are still required for task 7.5.
- Linear/product documentation updates remain task 7.7.
- PR, CI/review, merge, archive, and cleanup remain task 7.8.
