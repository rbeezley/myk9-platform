# Batch 4 verification

## Scope and source

MYK9-1225 already has its integer-centisecond fix in #3091 (`84d537dfa`); MYK9-1244 already has the Overview print flow in #3085 (`43b3912ad`). This change adds reusable verification, not speculative product edits. Local app build stamp: `e424b60699391a8f1f5230499824273dd5ead32d`, plus this uncommitted proof. Final-head CI must establish the committed proof/source identity before merge.

## Isolation

Owned native Supabase 2.121.0 stack `batch4-paperwork`, API 127.0.0.1:54341 and DB 127.0.0.1:54342. Official release digest verified. All migrations and canonical synthetic seed applied only there; generated account passwords remain private. Scheduled cron jobs were removed before fixture creation and count verified zero. Browser HTTP requests are restricted to loopback; observed nonlocal WebSocket lists are empty. Local evidence does not claim CI's container-level public-egress firewall; that is separately probed by the existing short job.

Every scenario creates a fresh class/entries/confirmed judge assignment. Canonical Willow/Cooper seed entries are not modified. Whole owned stack destruction replaces per-row restoration. No shared application data, deployment, payment or notification operation was performed.

## Executed local checks

- Historical local run before the final hook/capture changes: combined batch 3 + batch 4 real Chromium proof, six cases passed, zero retries, 39.7 seconds (`.logs/browser-combined.log`). This is evidence for that earlier scaffold, not for the current proof code. Only a complete final-head CI run supplies acceptance evidence for the current code.
- MYK9-1225: SQL `61.23`, reloaded secretary Willow row `1:01.23`, reloaded assigned judge Willow row `01:01.23`. Screenshot/text/SQL attachments retained by Playwright. Historical red assertion is recorded in the full Linear finding; #3091 supplies the existing fix and boundary/consumer tests.
- MYK9-1244 at 375px and 1280px: Overview route retained; two selected sheets generate one two-page PDF; real Chromium print API lifecycle creates exactly the check-in/scoresheet records; no confirmation toast; row Printed/time/Undo persists across reload; Reports says Printed and not Stale; Undo voids both records and both views return to not printed.
- Actual merged PDF pages rendered and visually inspected, and text extracted with pypdf. Correct check-in and scoresheet titles, both synthetic dogs/armbands and judge. Suspected header overlap did not reproduce on inspection; no renderer edit is warranted.
- Proof TypeScript graph, suite map and formatting passed. Ratchet passed after allowing tsx's local IPC socket; its first sandbox-denied launch was tooling failure, not a metric verdict. Focused artifact/print/consumer checks: six files, 70 tests passed. Formatter checks recorded separately.
- Canonical formatter checks: two files, 15 tests passed (`src/lib/format/__tests__/searchTime.test.ts` and `storedTimeFormatters.test.ts`). No Vitest tests were changed; the focused validation profile applies to this test/tooling-only change.

## Exact remaining acceptance gate

CI on `8c72d3f02` found a separate capture-readiness race at phone width: a blob URL existed, then the panel's mandatory data refetch superseded/revoked it before the proof fetched its bytes. `MergedSheetsPreview` deliberately empties/rebuilds the iframe on changed inputs. Capture now waits for bytes from one current URL generation; it repeats readiness only when the actual iframe URL changed, and propagates a fetch failure for the same URL. No browser/test retry, transport stub or product mutation is introduced. The final-source six-case run remains mandatory.

Controlled Chromium diagnostic executed the actual old/new callbacks extracted from source: original fetch fails on a genuinely revoked/superseded URL; the new callback reports not-ready, then captures current blob bytes. An unchanged broken URL still throws. This diagnostic uses native browser blobs and delegates fetch to the browser; it supplies red/green evidence for the capture race, not native print acceptance or the full application proof.

Subsequent CI on documentation head `98cf39200` passed five cases but timed out finding the desktop Print button after full-page preview capture. The retained preview image shows expanded full-page geometry and an absent panel; the failure screenshot shows the underlying Overview. The cockpit documents that a measured split/stack switch remounts its focused panel. The proof now captures the fixed viewport (no full-page expansion) after Print readiness, preserving the 375px/1280px scenario. This is a scoped evidence-capture correction, not a claimed product fix; require a complete zero-retry final-head run. Failed run: `39277334335`.

Headless Chromium's real print lifecycle does not prove cancellation of a native print dialog. The owned Chrome tab crashed before native assertions; it was closed without touching other tabs. Headed Firefox failed before test execution with a launch/profile failure, not an app assertion. No mocked print return, synthetic afterprint or synthetic focus was used to claim native acceptance.

**MYK9-1244 remains In Progress** until native dialog cancel/close records Printed and row Undo is verified in an isolated environment, or the owner explicitly accepts substitute evidence. All other isolated criteria pass. MYK9-1225 is eligible for closure after final-source CI, merge and recorded cleanup evidence. MYK9-1233's physical label-stock check remains outside this batch.

## Shipping and cleanup

Final PR/review/CI/merge references and verified owned-stack cleanup will be recorded on the Linear issues. Artifact scanner must pass before preserving/publishing the synthetic report outside this worktree. Do not copy private environment/stack logs. Keep any unfinished native operator gate visible; never mark it passed from unit tests or a merge alone.

Local cleanup completed: repository scrubber removed report credentials, scanner returned clean, and the synthetic HTML/PDF/screenshots were preserved under the task's persistent `batch4-paperwork/report` artifact directory. Private environment and raw stack logs were not copied. Destroy returned exit 0; subsequent native stack inventory was empty. Only the identified task-owned Vite preview and parent were stopped. Native failed browser attempt left no running owned Firefox process; the owned crashed Chrome tab was closed. No other tabs/stacks/processes were removed.

The `.logs/` and persistent report paths above are retained private task artifacts, not committed files or independently reproducible evidence from a checkout. Task 4.4 records cleanup of that historical local run; it does not mark final-head CI complete. Final-source run/artifact links must be recorded on the PR and Linear issue before closure.
