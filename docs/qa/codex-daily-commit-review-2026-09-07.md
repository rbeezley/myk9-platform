# Codex daily commit review — 2026-09-07

> **Status:** Reference

## Window and outcome

- Source: codex; automation: `nightly-commit-review`; methodology: `quality-finding-lifecycle`, with automatic Linear filing at every severity.
- Shared cursor: `8facd0017ccd4de5f9a28ae99ef1c58e2f89f910` (exclusive), previous window end `2026-09-06T10:15:59Z`.
- Reviewed all **35 first-parent descendants** through frozen `main` / `origin/main` `96edbabdcf81b819842fb236c7130b48b9564c0a`. Continuous window: **2026-09-06T10:15:59Z–2026-09-07T15:55:45Z**. No fallback, SHA gap, or time coverage gap. Idle time before the first descendant is not missing coverage. Later merges and this report commit remain for the next run.
- Created **MYK9-435, MYK9-436, MYK9-437**; reopened canonical **MYK9-427** for a residual acceptance criterion and **MYK9-423** for its original completion-evidence gate. No issues closed by this run. All five contain self-contained evidence, impact, next action, acceptance criteria, and closure proof.
- This is a review and docs-only reconciliation, with no application changes or implementation plan. OPSX implementation is not applicable.

| Lifecycle            | Count |
| -------------------- | ----: |
| New                  |     3 |
| Unchanged            |     1 |
| Resolved             |     3 |
| Blocked              |     1 |
| Duplicate / rejected | 0 / 0 |

Outstanding priorities: **P0 0 / P1 0 / P2 2 / P3 3**. Classifications: product convenience 1, accessibility/product intent 2, test harness 1, payment verification 1. Counts cover this reconciliation scope, not the entire backlog. No new security regression was confirmed.

## Must fix before treating the affected work as complete

### NCR-2026-09-07-01 / MYK9-435 — month scrubber loses keyboard access

[Linear execution contract](https://linear.app/myk9-platform/issue/MYK9-435). **P2 / Medium; new; Todo; unassigned UI maintainer.** First/last seen September 7; one run; confidence high.

- Introduced by #2087. At September 7, open `/shows?month=2026-01`: the valid URL month is outside the rolling tile window. `MonthScrubber.tsx:79-92` makes every radio `tabIndex=-1` because none matches the selected value.
- Expected: one truthful keyboard entry point remains for every valid month URL. Observed: the actual rendered component has zero tabbable radios, preventing keyboard entry and arrow navigation. Bookmarks age into this state without malformed input.
- Synthetic replay fixes the clock and renders the real component through the project test wrapper; the expected one-tab-stop assertion fails with zero. No network or user records involved. Later month-dot clock and map fixes do not repair this path.
- Closure: retain the URL's selected month honestly, add real component regression coverage for old/future months and ordinary selection, and record a keyboard browser replay. Reuse the existing scrubber; no new surface.

### MYK9-423 — payment recovery completion proof remains missing

[Canonical Linear contract](https://linear.app/myk9-platform/issue/MYK9-423). **P2 / Medium current; High historical source; blocked verification; In Progress; Richard Beezley.** First seen September 6, last checked September 7. High confidence in the evidence gap; no claim that the source fix is broken.

- #2082 (`260fa1145`) repairs cart recovery and adds `entry_cart_items.entry_id`, active-cart uniqueness, and webhook recovery handling. Focused cart/payment tests pass. Preserve this implemented scope.
- Original acceptance criteria include starting from the existing unpaid fee-card CTA, restoring those exact entries, completing checkout, marking the same entries paid, and clearing balances. The inspected PR explicitly leaves hosted replay/production verification unchecked; completion comments supply CI rather than this end-to-end evidence. Direct store/source tests do not prove the complete CTA-to-webhook path.
- Next: attach any already-existing proof first. Otherwise verify deployed schema/function versions read-only, then obtain authorization for an owned sandbox replay through the real CTA. Record exact line items/entry identities, payment completion without unintended refund, and both balance surfaces, plus CTA integration coverage.
- No database push, function deployment, payment, or live replay was performed by this review. This is a concrete original closure prerequisite, not a newly confirmed financial defect.

## Should fix soon

### MYK9-427 — signed-in users with no usable profile never reach IP fallback

[Canonical residual contract](https://linear.app/myk9-platform/issue/MYK9-427). **P3 / Low; new residual; Todo; Richard Beezley.** First/last seen September 7; one run; confidence high.

- #2090 promises device choice → profile → IP → Anywhere. `useViewerLocation.ts:53-66` returns null for an absent/unusable profile but enables the IP query only when there is no signed-in database user.
- With no remembered choice and a profile containing no address, the real hook settles at Anywhere and calls IP fallback zero times. Users lose the default miles/distance/nearest-first affordances until manually choosing a place. The pure resolver works; the orchestration prevents it receiving the fallback.
- The actual-hook probe mocks external I/O only and uses a fresh query client/storage. Its expected IP call fails. Existing tests do not cover this orchestration case. Reopened the original PR2 criterion, preserving completed redesign and map work.
- Closure: fallback after absent/failed profile resolution, preserve remembered/profile precedence and explicit Anywhere, add real-hook coverage, and record signed-in browser behavior.

### NCR-2026-09-07-02 / MYK9-436 — new controls violate sizing intent

[Linear execution contract](https://linear.app/myk9-platform/issue/MYK9-436). **P3 / Low; new; Todo; unassigned UI maintainer.** First/last seen September 7; one run; confidence high on emitted styles.

- #2087 `MonthScrubber.tsx:102-125` explicitly emits 11px month/year captions and 10px upcoming text, below `docs/INTENT.md`'s absolute 14px floor.
- #2080 `OperatorAlertDetail.tsx:20-26` overrides the ordinary interactive-control minimum with `min-h-10` (40px), below the documented 44px floor. This is not a dense-grid exemption.
- A real Tailwind/PostCSS compilation plus rendered scrubber produces computed 11px/10px. The same emitted `min-h-10` utility computes to 40px on a synthetic button; this is CSS evidence, **not** a claimed live bounding-box measurement of the actual admin button.
- Closure: remove the new size exceptions using established tokens; confirm actual computed fonts and control bounds in browser, keyboard focus, narrow layout, and wrapping. This is the product's intent contract, not an assertion of an automatic WCAG violation. Historical global sizing fixes MYK9-220/277 are related, not duplicated.

### NCR-2026-09-06-02 / MYK9-437 — real-clock reset test remains timing-fragile

[Linear execution contract](https://linear.app/myk9-platform/issue/MYK9-437). **P3 / Low; unchanged / newly filed; Todo; unassigned test maintainer.** Source claude, reconciler codex. First seen September 6, last checked September 7; two dated observations.

- Commit `881f43275` recorded a confirmed failure but deliberately withheld filing under an older recurrence threshold. The user's all-severity first-occurrence filing policy supersedes that threshold.
- `appApiRequestTracker.test.ts:160-190` still uses real timers with `idleMs:5, timeoutMs:20`. Original evidence: one failure in seven full shuffled runs (seed `1788723296711`) under CPU contention, with zero pending requests; five isolated passes.
- Current deterministic mechanism replay advances the real helper's polling clock by 21ms after `reset()`, with zero pending requests, and reproduces `settled:false`. This is a simulated scheduler-delay proof, **not** a new natural load failure or a defect in the helper's timeout semantics.
- Closure: test reset state independently of host speed, prove negative mutations removing pending-clear or activity reset are caught, and record focused repeats plus CI. Preserve production timeout semantics. Distinct from completed MYK9-289's pending-set leak.

## No blocking findings remaining in these prior records

All checked against `96edbabdcf81b819842fb236c7130b48b9564c0a`; lifecycle resolved; existing Linear Done states unchanged. Last checked September 7. First-seen dates and historical severity remain preserved.

| Canonical record                                                                | Priority / first seen | Required closure evidence now available                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MYK9-424 / NCR-2026-09-06-01](https://linear.app/myk9-platform/issue/MYK9-424) | P1 / High; Sep 6      | #2081 bounds enrichment and preserves authorized cached staff Q/time/placement. Current focused tests pass. Existing closure comment `dbc80c4f` records real hook/read/mapper/ResultsSheet/HighInTrial replay offline, no result I/O, two Qs, placement 1, 38.5 seconds each and HIT 77. This satisfies the recorded rendered/browser-equivalent gate; no hosted replay claimed. [Archived plan](../archive/plan-myk9-424.md).      |
| [MYK9-407](https://linear.app/myk9-platform/issue/MYK9-407)                     | P3 / Low; Sep 5       | Recorded deployed v33 all nine sources match main; fresh full and continuous snapshots use 172800000ms for all three ACL windows with consistent checked timestamps, and authenticated admin dashboard/health pages match. [Exact September 6 hosted proof](myk9-407-hosted-verification-2026-09-06.md). This run inspected recorded proof, not a new deployment.                                                                   |
| [MYK9-408 / NCR-2026-09-05-01](https://linear.app/myk9-platform/issue/MYK9-408) | P3 / Low; Sep 5       | #2079 establishes mechanical installation parity. This run verifies all six actual installed prompts byte-identical; 14 parity tests included in the passing script suite. Recorded owning-scheduler proof preserves Claude disabled/no next run and Codex active; September 6 is now complete and its boundary history contains exactly one stamp, `f47c47ed7`. No scheduler mutation or freshly queried Claude scheduler claimed. |

## Verification and limits

- **756 existing tests in 56 files pass**: all 54 changed app Vitest files / 690 tests (20 files /155; 20 /243; 14 /292), plus script prompt-parity/inflight tests (2 files /66). Group durations: 7.65s, 10.15s, 9.21s and 42.15s.
- Four temporary expected-behavior probes deliberately fail with six failed assertions: IP fallback, old-month keyboard access, three sizing assertions, and reset-test timing mechanism. They are audit evidence, not passing product regressions or app changes. Exact TypeScript probe below; external I/O is synthetic.
- All six installed scheduled prompts pass `check-prompt-parity.ts --require-installed`; E2E suite map covers 128 specs; living-plan metadata/index check passes.
- Test-project TypeScript check **passes**, including the temporary probe. The first invocation identified an audit-only import declaration issue; correcting the typed runtime config import produced a clean rerun. The final probe replay still fails on the same six expected-behavior assertions (four tests), with no import/runtime error.
- Frozen-tip CI run [34133850796](https://github.com/rbeezley/myk9-platform/actions/runs/34133850796) and predecessor run 34131120839 were cancelled when inspected. [Open #2110](https://github.com/rbeezley/myk9-platform/pull/2110) already owns main-run cancellation. No duplicate filed; **main CI is not claimed green**. Focused local checks do not replace all integration gates.
- Read changed runtime and security/data paths, later fixes, migrations, linked acceptance criteria, recorded closure evidence, and archived-inclusive Linear matches. No full suite, browser/E2E, hosted SQL, payment, deployment, device or load test was performed.
- Isolated detached worktree `/private/tmp/myk9-ncr-review-20260907` at the frozen SHA, with owned dependency symlinks. Temporary probe and symlinks are removed after preserving evidence. Primary untracked `.agents/skills/impeccable/` is unrelated and preserved.

## Commit inventory

```text
f47c47ed7 docs(qa): record daily commit review 2026-09-06
ae05bbb60 docs(qa): close MYK9-407 hosted cadence verification
42098926f fix(ops): make scheduled-task prompt parity mechanical and checkable (#2079)
010f2f708 chore(qa): in-flight check — refuse to start work something else already touches (#2073)
7f8011362 docs(landing): preserve Codex's landing-page audit and concept prototype (#2083)
6bf800821 fix(admin): make payout alert details readable (#2080)
4c366c791 fix(exhibitor): reconcile the two wait-list sources on My Shows (#2084)
2d8b5f5dc docs(rules): scope the shuffled-run count to the risk, and state the arithmetic (#2085)
260fa1145 fix(payments): recreate cart for unpaid entry recovery (#2082)
7ccc08f9a fix(reports): preserve cached staff results offline (#2081)
6d449ee9a docs(plan): archive MYK9-424 plan after #2081 shipped
fe7395706 feat(shows): cards default, five-column table, month scrubber on Find Shows (MYK9-427, PR 1/2) (#2087)
881f43275 docs(qa): record the appApiRequestTracker unit-test timing flake
a74840213 fix(exhibitor): state the payment on the Receipt link's destination (#2086)
904313453 fix(auth): fit the sign-in front door on one screen (#2088)
9579c09cf feat(shows): location-aware Near field, miles labels and a Distance chip on Find Shows (MYK9-427 PR 2) (#2090)
f077e14ce docs(plan): archive MYK9-427 Find Shows redesign after #2087 and #2090 shipped
741fa6dcf fix(shows): derive the Results tab badge from the results the tab renders (MYK9-419) (#2089)
b61c2ec23 fix(secretary): give the class override tabs names and labels at every width (#2091)
5949a136b fix(shows): let the Near field show the whole city (MYK9-431) (#2092)
337dcd6db fix(a11y): take primary button labels from the token, not hardcoded white (#2093)
c539a6f12 fix(templates): reconcile the persisted AKC Scent Work fallback with the DB row (MYK9-432) (#2094)
7e7a14677 test(shows): pin the clock in the month scrubber dot test (#2097)
21e093b2b fix(a11y): make the breed picker a real listbox, not buttons in a dialog (MYK9-422) (#2096)
af65aca25 test(e2e): promote the sign-in fit spec to PR Smoke (#2095)
bb955cb84 fix(shows): scope the Find Shows map failure to its own panel (#2098)
72af522a1 fix(exhibitor): scope exhibitor query keys to the viewer and clear the cache on account change (MYK9-429) (#2099)
88c2b0024 fix(qa): skip the selected base branch in inflight, not the literal name main (#2101)
63f6cba04 fix(exhibitor): resolve every order refund from one shared derivation (MYK9-428) (#2103)
02d67a625 fix(secretary): show the custom name on a retained cloned class card (MYK9-389) (#2102)
6510e9cf5 fix(shows): show something when the map's tiles are blocked (#2100)
ba3f47d28 fix(auth): keep the sign-in card clear of the fixed header (#2106)
623ed85d6 docs(research): record the 2026-09-05 worktree disposition survey
45f6695ab fix(admin): wrap the health verdict on available width, not viewport (MYK9-434) (#2108)
96edbabdc fix(auth): tighten the sign-in card's density on phones (#2109)
```

## Reproduction evidence

Run the following temporary test from `apps/myk9show/src/test/ncr20260907.audit.test.tsx` with the app's Vitest command at the reviewed SHA. The assertions intentionally express the required behavior; the 21ms timing case demonstrates why the historical reset test cannot rely on a 20ms wall-clock budget. The sizing case compiles repository utilities and distinguishes rendered month text from the synthetic minimum-height utility check.

```tsx
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from './utils/testUtils';
import { MonthScrubber } from '@/components/shows/browse/MonthScrubber';
import { useViewerLocation } from '@/features/location/useViewerLocation';
import { fetchApproximateLocation } from '@/features/location/geoClient';
import postcss from 'postcss';
import tailwindcss, { type Config } from 'tailwindcss';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { watchAppApiRequests, waitForAppApiRequestsToSettle } from './harness/appApiRequestTracker';

vi.mock('@/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { city: null, state: null, zip_code: null },
            error: null,
          }),
        }),
      }),
    }),
  },
}));
vi.mock('@/features/location/geoClient', () => ({
  fetchApproximateLocation: vi.fn(async () => ({
    label: 'Fixture City',
    lat: 36,
    lng: -96,
    source: 'ip',
  })),
  geocodePlaceQuery: vi.fn(async () => null),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

function LocationProbe() {
  const viewer = useViewerLocation('fixture-person');
  return (
    <output data-testid="location">
      {viewer.isResolving ? 'loading' : (viewer.location?.label ?? 'Anywhere')}
    </output>
  );
}

it('falls back to approximate city for an account with no profile address', async () => {
  render(<LocationProbe />);
  await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('loading'));
  expect(fetchApproximateLocation).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('location')).toHaveTextContent('Fixture City');
});

it('retains a keyboard tab stop for a valid month outside the rolling tile window', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
  render(<MonthScrubber shows={[]} value="2026-01" onChange={() => {}} />);
  const radios = screen.getAllByRole('radio');
  expect(radios.filter(radio => radio.tabIndex === 0)).toHaveLength(1);
});

it('replays the recorded reset-test assertion when its polling callback arrives 21ms late', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
  const page = {
    on: vi.fn(),
    waitForTimeout: async () => {
      vi.setSystemTime(Date.now() + 21);
    },
  } as unknown as Page;
  const tracker = watchAppApiRequests(page);
  tracker.reset();
  expect(tracker.pending.size).toBe(0);
  await expect(
    waitForAppApiRequestsToSettle(page, tracker, { idleMs: 5, timeoutMs: 20 })
  ).resolves.toEqual({ settled: true, pendingUrls: [] });
});

it('keeps the new month labels and admin detail control within INTENT sizing floors', async () => {
  const appRoot = resolve(import.meta.dirname, '../..');
  const source =
    readFileSync(resolve(appRoot, 'src/components/shows/browse/MonthScrubber.tsx'), 'utf8') +
    readFileSync(resolve(appRoot, 'src/pages/admin/OperatorAlertDetail.tsx'), 'utf8');
  const config: Config = (await import(resolve(appRoot, 'tailwind.config.js'))).default;
  const { css } = await postcss([
    tailwindcss({
      ...config,
      content: [{ raw: source, extension: 'tsx' }],
      corePlugins: { preflight: false },
    }),
  ]).process('@tailwind utilities;', { from: undefined });
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  render(<MonthScrubber shows={[]} value="all" onChange={() => {}} />);
  expect
    .soft(parseFloat(getComputedStyle(screen.getByText('ALL')).fontSize))
    .toBeGreaterThanOrEqual(14);
  expect
    .soft(parseFloat(getComputedStyle(screen.getByText('upcoming')).fontSize))
    .toBeGreaterThanOrEqual(14);
  const control = document.createElement('button');
  control.className = 'min-h-10';
  document.body.appendChild(control);
  const height = getComputedStyle(control).minHeight;
  expect.soft(parseFloat(height) * (height.endsWith('rem') ? 16 : 1)).toBeGreaterThanOrEqual(44);
  control.remove();
  style.remove();
});
```
