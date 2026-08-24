# Unified Check-In Sheet and Scoresheet Implementation Plan

> **Status:** Active

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one jsPDF renderer produce the check-in sheet and scoresheet for both the Reports page and the emergency trial packet, so the paper a judge retains for a year is the same document either way.

**Architecture:** The renderer at `supabase/functions/_shared/trialPacket/renderer/` becomes canonical. It is imported directly by the Deno edge function and, through re-export shims in `apps/myk9show/src/features/emergency-trial-packet/`, by the app. The Reports page gains a `buildPdf` path for exactly two of its 35 entries; the React components those two used are deleted. Registry-varied vocabulary (reason lists, org title) lives in a new Deno-safe config module inside the renderer.

**Tech Stack:** TypeScript, jsPDF 4.2.1 (constructor injected, never imported by the shared module), Deno edge functions, vitest, Postgres/Supabase.

**Spec:** [`docs/superpowers/specs/2026-08-23-unified-scoresheet-design.md`](../specs/2026-08-23-unified-scoresheet-design.md)

## Global Constraints

- Files under `supabase/functions/_shared/trialPacket/renderer/` carry **no `@/` aliases, no app imports, and no runtime dependency on jspdf**. jsPDF arrives as a constructor argument.
- Any test covering edge-function code needs `// @vitest-environment node` at the top.
- New test files must be registered in **both** `apps/myk9show/vitest.config.ts` `test.include` **and** `apps/myk9show/tsconfig.edge-tests.json` `include`. Missing the first means the test never runs; missing the second means it runs but is never typechecked.
- Page geometry: `PAGE_WIDTH = 215.9`, `PAGE_HEIGHT = 279.4`, `LEFT = 14`, `RIGHT = PAGE_WIDTH - 14`. Usable width is 187.9mm.
- Every text field drawn into a bounded region must go through `fitTextToWidth`. jsPDF has **no reflow** — overlong text silently overprints its neighbour.
- Result states for scent work are exactly `Q`, `NQ`, `EX`, `ABS`.
- Assertions are on geometry and content, never on source text. A test that greps the renderer's source proves only that someone typed something.
- Pick any migration timestamp against `origin/main`, not this branch: `git fetch origin main && git ls-tree --name-only origin/main supabase/migrations/ | tail`.

---

### Task 1: Registry scoresheet config

The vocabulary the sheet prints — org title, reason lists, fault counters — varies by registry. It lives in the renderer because both runtimes import from there, and because it has no prior home in the app.

**Files:**
- Create: `supabase/functions/_shared/trialPacket/renderer/scoresheetConfig.ts`
- Create: `apps/myk9show/src/features/emergency-trial-packet/scoresheetConfig.ts` (re-export shim)
- Create: `apps/myk9show/src/features/emergency-trial-packet/scoresheetConfig.test.ts`
- Modify: `apps/myk9show/vitest.config.ts`, `apps/myk9show/tsconfig.edge-tests.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `ScoresheetRegistryConfig`, `resolveScoresheetConfig(registryId: string | null | undefined): ScoresheetRegistryConfig`, `SCORESHEET_CONFIGS: Record<string, ScoresheetRegistryConfig>`, `GENERIC_SCORESHEET_CONFIG: ScoresheetRegistryConfig`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  GENERIC_SCORESHEET_CONFIG,
  SCORESHEET_CONFIGS,
  resolveScoresheetConfig,
} from './scoresheetConfig';

describe('resolveScoresheetConfig', () => {
  it('returns the registry-specific config when the id is known', () => {
    const config = resolveScoresheetConfig('akc');
    expect(config.orgTitle).toBe('AKC Scent Work');
    expect(config.resultStates).toEqual(['Q', 'NQ', 'EX', 'ABS']);
  });

  it('falls back to the generic config rather than throwing on an unknown id', () => {
    // A packet that fails to render at 6am because a trial carries an
    // unexpected registry id is worse than one with generic reason lists.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveScoresheetConfig('not-a-registry')).toBe(GENERIC_SCORESHEET_CONFIG);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back on a null id without warning', () => {
    // Null is "no registry recorded", which is expected data, not a misconfiguration.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveScoresheetConfig(null)).toBe(GENERIC_SCORESHEET_CONFIG);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('gives every config a non-empty NQ and EX list', () => {
    for (const [id, config] of Object.entries(SCORESHEET_CONFIGS)) {
      expect(config.nqReasons.length, `${id} nqReasons`).toBeGreaterThan(0);
      expect(config.exReasons.length, `${id} exReasons`).toBeGreaterThan(0);
      expect(config.faultCounters.length, `${id} faultCounters`).toBeGreaterThan(0);
    }
  });

  it('keeps every reason short enough to print in the 45mm reason column', () => {
    // The column fits roughly 26 characters at 7pt. A longer reason is not a
    // wrapping bug — fitTextToWidth would shrink it to unreadable.
    for (const config of Object.values(SCORESHEET_CONFIGS)) {
      for (const reason of [...config.nqReasons, ...config.exReasons]) {
        expect(reason.length, reason).toBeLessThanOrEqual(26);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/features/emergency-trial-packet/scoresheetConfig.test.ts`
Expected: FAIL — cannot resolve `./scoresheetConfig`.

- [ ] **Step 3: Write the config module**

Create `supabase/functions/_shared/trialPacket/renderer/scoresheetConfig.ts`:

```ts
/**
 * Registry-varied vocabulary for the scoresheet.
 *
 * Lives here, not in `@/features/registries`, because a Deno edge function
 * cannot reach into `apps/myk9show/src` and this module is imported by both
 * runtimes (the app side is a re-export shim, not a copy). `@/features/registries`
 * keeps what it owns — landing style, trial registry, timezone — and does not
 * gain scoresheet vocabulary.
 *
 * The SHAPE is identical across registries; only the wording changes. That is
 * the finding this whole design rests on: the sheet already reads element,
 * level, section, hides, distractions and per-area time limits from class data.
 */

export interface ScoresheetRegistryConfig {
  /** Printed in the sheet title, e.g. "AKC Scent Work Scoresheet". */
  orgTitle: string;
  /** Checkbox row. Scent work is Q / NQ / EX / ABS. */
  resultStates: readonly string[];
  /** Tallied by the judge into small numeric boxes — counts, not notes. */
  faultCounters: readonly string[];
  nqReasons: readonly string[];
  exReasons: readonly string[];
}

const SCENT_WORK_RESULT_STATES = ['Q', 'NQ', 'EX', 'ABS'] as const;
const SCENT_WORK_FAULTS = ['Handler Error', 'Safety Concern', 'Mild Disruption'] as const;

export const GENERIC_SCORESHEET_CONFIG: ScoresheetRegistryConfig = {
  orgTitle: 'Scent Work',
  resultStates: SCENT_WORK_RESULT_STATES,
  faultCounters: SCENT_WORK_FAULTS,
  nqReasons: [
    'Incorrect Call',
    'Max Time',
    'Point to Hide',
    'Harsh Correction',
    'Significant Disruption',
  ],
  exReasons: [
    'Eliminated in Area',
    'Handler Request',
    'Out of Control',
    'Overly Stressed',
    'Other',
  ],
};

export const SCORESHEET_CONFIGS: Record<string, ScoresheetRegistryConfig> = {
  akc: { ...GENERIC_SCORESHEET_CONFIG, orgTitle: 'AKC Scent Work' },
  ukc: { ...GENERIC_SCORESHEET_CONFIG, orgTitle: 'UKC Nosework' },
  asca: { ...GENERIC_SCORESHEET_CONFIG, orgTitle: 'ASCA Scent Detection' },
};

/**
 * Never throws. An unknown id falls back to the generic config and warns; a
 * null id falls back silently, because "no registry recorded" is ordinary data
 * rather than a misconfiguration worth logging on every page.
 */
export function resolveScoresheetConfig(
  registryId: string | null | undefined
): ScoresheetRegistryConfig {
  if (!registryId) return GENERIC_SCORESHEET_CONFIG;
  const config = SCORESHEET_CONFIGS[registryId.toLowerCase()];
  if (config) return config;
  console.warn(`resolveScoresheetConfig: unknown registryId "${registryId}", using generic sheet`);
  return GENERIC_SCORESHEET_CONFIG;
}
```

Create the shim `apps/myk9show/src/features/emergency-trial-packet/scoresheetConfig.ts`, matching the wording of the existing shims in that directory:

```ts
/**
 * The packet renderer now lives under `supabase/functions/_shared/trialPacket/`
 * so the browser and the `generate-trial-packet` edge function import the SAME
 * file — a Deno function cannot reach into `apps/myk9show/src`, and a copy on
 * either side would be a second renderer to keep in step (MYK9-228 phase 3).
 *
 * This re-export keeps every `@/features/emergency-trial-packet/...` import in
 * the app working, and keeps the alias-free constraint on the shared module in
 * one obvious place.
 */
export * from '../../../../../supabase/functions/_shared/trialPacket/renderer/scoresheetConfig.ts';
```

- [ ] **Step 4: Register the test in both allowlists**

In `apps/myk9show/vitest.config.ts`, add to `test.include` alongside the existing emergency-trial-packet entries. In `apps/myk9show/tsconfig.edge-tests.json`, add the same path to `include`. Confirm the file is actually picked up:

Run: `cd apps/myk9show && pnpm vitest run src/features/emergency-trial-packet/scoresheetConfig.test.ts && pnpm typecheck:edge-tests`
Expected: 5 tests PASS, typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/trialPacket/renderer/scoresheetConfig.ts \
        apps/myk9show/src/features/emergency-trial-packet/scoresheetConfig.ts \
        apps/myk9show/src/features/emergency-trial-packet/scoresheetConfig.test.ts \
        apps/myk9show/vitest.config.ts apps/myk9show/tsconfig.edge-tests.json
git commit -m "feat(scoresheet): registry-varied vocabulary in the shared renderer"
```

---

### Task 2: Carry hides and distractions through to the packet

The Reports class header prints hides and distractions; `EmergencyPacketClass` has no such fields, so the packet cannot render them today. The packet's input comes from the `emergency_packet_input` SECURITY DEFINER RPC, so this needs a migration as well as a type change.

**Files:**
- Modify: `supabase/functions/_shared/trialPacket/renderer/types.ts`
- Create: `supabase/migrations/<timestamp>_emergency_packet_input_hides.sql`
- Modify: `apps/myk9show/src/test/database/emergencyPacketInputRpcContract.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `EmergencyPacketClass.numHides: number | null` and `EmergencyPacketClass.distractionCount: number | null`, consumed by Task 4.

- [ ] **Step 1: Write the failing contract test**

Add to `apps/myk9show/src/test/database/emergencyPacketInputRpcContract.test.ts`, inside the existing `describe('emergency_packet_input contract')`. Read the file first — it reads the migration SQL into a `sql` const; this test must read the NEW migration, so add a second `readFileSync` beside the existing one and name it `hidesSql`:

```ts
  it('exposes hides and distraction counts on each class', () => {
    // The scoresheet header prints both. Without them the packet's header is
    // thinner than the Reports one and the two documents are not the same sheet.
    expect(hidesSql).toMatch(/'numHides',\s*cl\.num_hides/);
    expect(hidesSql).toMatch(/'distractionCount',\s*cl\.distraction_count/);
  });

  it('keeps the definer function locked down after the rebuild', () => {
    // CREATE OR REPLACE preserves the ACL, but this migration re-declares the
    // function, so the grants are restated and must still be restated correctly.
    expect(hidesSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.emergency_packet_input\(uuid, date\) FROM PUBLIC, anon, authenticated;/
    );
    expect(hidesSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.emergency_packet_input\(uuid, date\) TO service_role;/
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/database/emergencyPacketInputRpcContract.test.ts`
Expected: FAIL — the new migration file does not exist.

- [ ] **Step 3: Write the migration**

Pick the timestamp against `origin/main` first. Copy the **whole** `emergency_packet_input` body from `supabase/migrations/20260821220000_emergency_packet_input_rpc.sql` — never from an older-looking file — and add two keys to the class `jsonb_build_object` after `'numAreas'`:

```sql
        'numAreas', cl.num_areas,
        'numHides', cl.num_hides,
        'distractionCount', cl.distraction_count
```

Add `cl.num_hides, cl.distraction_count` to the class CTE's select list (near `cl.num_areas` on line 81 of the source migration). Restate the grants verbatim at the end:

```sql
REVOKE ALL ON FUNCTION public.emergency_packet_input(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emergency_packet_input(uuid, date) TO service_role;
```

- [ ] **Step 4: Extend the renderer type**

In `supabase/functions/_shared/trialPacket/renderer/types.ts`, add to `EmergencyPacketClass` after `numAreas`:

```ts
  /** Hide count for the class header. Null means "not configured", not zero. */
  numHides: number | null;
  /** Distraction count for the class header. Null means "not configured". */
  distractionCount: number | null;
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/myk9show && pnpm vitest run src/test/database/emergencyPacketInputRpcContract.test.ts && pnpm typecheck`
Expected: PASS. Typecheck will surface every fixture that constructs an `EmergencyPacketClass`; add `numHides: null, distractionCount: null` to each.

- [ ] **Step 6: Record the rollback path [ADDED]**

`CREATE OR REPLACE FUNCTION` is forward-only — there is no automatic revert. Add this comment
at the top of the new migration so a future incident does not have to reconstruct it:

```sql
-- ROLLBACK: re-apply the function body from
-- supabase/migrations/20260821220000_emergency_packet_input_rpc.sql as a new
-- CREATE OR REPLACE migration. The two added JSON keys are additive; a renderer
-- built before this migration ignores them, so an older app against a newer DB
-- is safe. The reverse (newer renderer, older RPC) yields null hides and
-- distractions, which the header already treats as "not configured".
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations apps/myk9show/src/test/database/emergencyPacketInputRpcContract.test.ts \
        supabase/functions/_shared/trialPacket/renderer/types.ts
git commit -m "feat(packet): carry hides and distraction counts into the packet input"
```

---

### Task 3: Merged check-in sheet

Eight columns: the union of both current versions. Replaces `renderCheckIn` in the shared renderer.

**Files:**
- Modify: `supabase/functions/_shared/trialPacket/renderer/buildEmergencyTrialPacketPdf.ts:332` (`renderCheckIn`)
- Modify: `apps/myk9show/src/features/emergency-trial-packet/buildEmergencyTrialPacketPdf.test.ts`

**Interfaces:**
- Consumes: `EmergencyPacketPage` from Task 2's updated types.
- Produces: no new exports; `renderCheckIn` stays private to the module.

- [ ] **Step 1: Write the failing test**

The existing test file already builds a jsPDF document and inspects it. Follow its established pattern for constructing a page, then add:

```ts
  it('prints all eight check-in columns', () => {
    const { doc, texts } = renderPageOfKind('check-in');
    for (const header of [
      'Gate', 'Order', 'Armband', 'Call Name', 'Breed', 'Reg #', 'Handler', 'Pull / Move / Note',
    ]) {
      expect(texts, header).toContain(header);
    }
    expect(doc).toBeDefined();
  });

  it('keeps every check-in column inside the printable width', () => {
    // jsPDF does not reflow. A column that starts past RIGHT is drawn off-page
    // and simply never appears on paper.
    const { columnStarts, columnWidths } = checkInColumnGeometry();
    const last = columnStarts.length - 1;
    expect(columnStarts[0]).toBeGreaterThanOrEqual(14);
    expect(columnStarts[last] + columnWidths[last]).toBeLessThanOrEqual(215.9 - 14);
  });

  // [EXPANDED] Every text column, not just breed. Guarding one field and
  // leaving the other six is the same bug with better odds.
  it.each([
    ['breed', 'Nederlandse Kooikerhondje Extremely Long Registered Breed Name'],
    ['callName', 'Bartholomew Fitzgerald Wellington The Third Of Somewhere'],
    ['handler', 'Anastasia Konstantinopoulos-Wetherbottom'],
    ['registrationNumber', 'SR-99999999-XX-ALTERNATE-REGISTRY-LONGFORM'],
  ])('truncates an overlong %s rather than overprinting the next column', (field, value) => {
    const { texts } = renderPageOfKind('check-in', { [field]: value });
    const printed = texts.find(text => value.startsWith(text.slice(0, 8)));
    expect(printed, `${field} was not printed at all`).toBeDefined();
    expect(printed!.length).toBeLessThan(value.length);
  });
```

Write the `renderPageOfKind` and `checkInColumnGeometry` helpers at the top of the describe block, exporting the column table from the renderer so geometry is assertable rather than inferred:

```ts
import { CHECK_IN_COLUMNS } from './buildEmergencyTrialPacketPdf';

function checkInColumnGeometry() {
  return {
    columnStarts: CHECK_IN_COLUMNS.map(column => column.x),
    columnWidths: CHECK_IN_COLUMNS.map(column => column.width),
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/features/emergency-trial-packet/buildEmergencyTrialPacketPdf.test.ts`
Expected: FAIL — `CHECK_IN_COLUMNS` is not exported.

- [ ] **Step 3: Implement the merged columns**

In `buildEmergencyTrialPacketPdf.ts`, replace the header array at line 337 and export the table so it can be asserted:

```ts
/**
 * The union of the two check-in sheets this replaced: `Order` and
 * `Pull / Move / Note` came from the packet, `Reg #` from the Reports sheet.
 * Widths sum to 187.9 (RIGHT - LEFT) and are asserted in the test — jsPDF does
 * not reflow, so a column past RIGHT is drawn off the page.
 */
export const CHECK_IN_COLUMNS = [
  { key: 'gate', label: 'Gate', x: 14, width: 12 },
  { key: 'order', label: 'Order', x: 26, width: 14 },
  { key: 'armband', label: 'Armband', x: 40, width: 20 },
  { key: 'callName', label: 'Call Name', x: 60, width: 34 },
  { key: 'breed', label: 'Breed', x: 94, width: 32 },
  { key: 'registrationNumber', label: 'Reg #', x: 126, width: 26 },
  { key: 'handler', label: 'Handler', x: 152, width: 30 },
  { key: 'note', label: 'Pull / Move / Note', x: 182, width: 19.9 },
] as const;
```

Rewrite `renderCheckIn` to draw the header row from `CHECK_IN_COLUMNS` and each entry row by looking up the entry field for each `key`, passing every value through `fitTextToWidth(doc, value, column.width - 2)`. `gate` and `note` render as empty ruled cells.

- [ ] **Step 4: Run the tests**

Run: `cd apps/myk9show && pnpm vitest run src/features/emergency-trial-packet/buildEmergencyTrialPacketPdf.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Widen `handler` to `width: 60` so the last column runs past `RIGHT`, re-run, and confirm the width test fails. Then remove the `fitTextToWidth` call on breed and confirm the truncation test fails. Restore both.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/trialPacket/renderer/buildEmergencyTrialPacketPdf.ts \
        apps/myk9show/src/features/emergency-trial-packet/buildEmergencyTrialPacketPdf.test.ts
git commit -m "feat(check-in): merge the packet and Reports check-in sheets into one"
```

---

### Task 4: Scoresheet per-dog block

Replaces `renderScoreRecording`. This is the task the whole design exists for.

**Files:**
- Modify: `supabase/functions/_shared/trialPacket/renderer/buildEmergencyTrialPacketPdf.ts:352` (`renderScoreRecording`)
- Modify: `apps/myk9show/src/features/emergency-trial-packet/buildEmergencyTrialPacketPdf.test.ts`

**Interfaces:**
- Consumes: `resolveScoresheetConfig` (Task 1); `numHides`/`distractionCount` (Task 2).
- Produces: `SCORE_BLOCK_HEIGHT_MM: number`, exported so Task 5's pagination and its tests share one number rather than two that can drift.

- [ ] **Step 1: Write the failing test**

```ts
import { SCORE_BLOCK_HEIGHT_MM } from './buildEmergencyTrialPacketPdf';

describe('scoresheet per-dog block', () => {
  it('prints all four result states', () => {
    const { texts } = renderPageOfKind('score-recording');
    for (const state of ['Q', 'NQ', 'EX', 'ABS']) {
      expect(texts).toContain(state);
    }
  });

  it('prints a place field, which only matters when the app is down', () => {
    // INTENT: extra information the judge ignores when the app is up. Do not
    // remove as a simplification — see the spec's "one sheet, superset" note.
    const { texts } = renderPageOfKind('score-recording');
    expect(texts.some(text => text.startsWith('Place'))).toBe(true);
  });

  it('prints the registry reason lists, not a hard-coded set', () => {
    const { texts } = renderPageOfKind('score-recording', {}, { registryId: 'akc' });
    for (const reason of resolveScoresheetConfig('akc').nqReasons) {
      expect(texts).toContain(reason);
    }
  });

  it('prints the three fault counters as tallies', () => {
    const { texts } = renderPageOfKind('score-recording');
    for (const fault of ['Handler Error', 'Safety Concern', 'Mild Disruption']) {
      expect(texts).toContain(fault);
    }
  });

  it('prints MM/SS/TT for a single-area class', () => {
    const { texts } = renderPageOfKind('score-recording', {}, { numAreas: 1 });
    expect(texts.filter(text => text === 'MM')).toHaveLength(1);
    expect(texts).not.toContain('A2');
  });

  it('prints per-area rows plus a total for a multi-area class', () => {
    const { texts } = renderPageOfKind('score-recording', {}, { numAreas: 3 });
    for (const label of ['A1', 'A2', 'A3', 'Total']) {
      expect(texts).toContain(label);
    }
  });

  it('keeps the multi-area time stack inside the block height', () => {
    // The four time rows must fit the height the reason lists already set, or
    // pagination silently overflows for 3-area classes only.
    const single = blockExtent({ numAreas: 1 });
    const multi = blockExtent({ numAreas: 3 });
    expect(multi).toBeLessThanOrEqual(SCORE_BLOCK_HEIGHT_MM);
    expect(single).toBeLessThanOrEqual(SCORE_BLOCK_HEIGHT_MM);
  });
});
```

Write `blockExtent(classOverrides)` to render one block and return the greatest `y` any element reached, minus the block's start `y`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/features/emergency-trial-packet/buildEmergencyTrialPacketPdf.test.ts -t "scoresheet per-dog block"`
Expected: FAIL — `SCORE_BLOCK_HEIGHT_MM` is not exported.

- [ ] **Step 3: Implement the block**

Replace `renderScoreRecording`. Export the height and lay out five regions at the widths the spec fixes:

```ts
/**
 * Set by the reason lists: five items at ~4mm plus a label is ~24mm, and the
 * identity and fault regions fit inside that. The multi-area time stack (four
 * rows of ~6mm) also fits, which is why a 3-area class does not need a taller
 * block. Exported so pagination and its tests share ONE number.
 */
export const SCORE_BLOCK_HEIGHT_MM = 36;

// [ADDED] INTENT: this sheet is a SUPERSET of what either surface needs. `Place`
// and the free-text note are dead weight when the app is up and the only record
// when it is down. Do not split this into "normal" and "emergency" variants, and
// do not delete the unused-looking fields as a simplification. One document,
// printed the same way every time, is the point.

const SCORE_REGIONS = {
  identity: { x: 14, width: 55 },
  result: { x: 69, width: 30 },
  faults: { x: 99, width: 35 },
  reasons: { x: 134, width: 45 },
  time: { x: 179, width: 22.9 },
} as const;
```

Draw, per entry: identity (armband at 11pt bold, then call name, breed, reg #, handler at 7pt, each through `fitTextToWidth`); result checkboxes from `config.resultStates` plus `Place: ____`; the three `config.faultCounters` each with a small square; `config.nqReasons` and `config.exReasons` as checkbox lists under `NQ` and `EX` labels; and the time region — `MM/SS/TT` boxes when `areaCount === 1`, else `A1..An` rows plus `Total`, reusing the existing `areaCount` computation from `emergencyTrialPacket.ts` rather than recomputing it.

- [ ] **Step 4: Run the tests**

Run: `cd apps/myk9show && pnpm vitest run src/features/emergency-trial-packet/buildEmergencyTrialPacketPdf.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Swap `resolveScoresheetConfig('akc')` for `GENERIC_SCORESHEET_CONFIG` in the renderer and confirm the registry-reasons test still passes — **it will**, because the lists are currently identical, so instead change one AKC reason in `scoresheetConfig.ts` to a distinct string and confirm the test then fails. Set `SCORE_BLOCK_HEIGHT_MM = 30` and confirm the multi-area extent test fails. Restore both.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/trialPacket/renderer/buildEmergencyTrialPacketPdf.ts \
        apps/myk9show/src/features/emergency-trial-packet/buildEmergencyTrialPacketPdf.test.ts
git commit -m "feat(scoresheet): full per-dog block with registry reason lists"
```

---

### Task 5: Pagination — 5 first page, 6 continuation, never split

**Files:**
- Modify: `supabase/functions/_shared/trialPacket/renderer/emergencyTrialPacket.ts:30,288`
- Modify: `apps/myk9show/src/features/emergency-trial-packet/emergencyTrialPacket.test.ts`

**Interfaces:**
- Consumes: `SCORE_BLOCK_HEIGHT_MM` (Task 4).
- Produces: `SCORE_ROWS_FIRST_PAGE = 5`, `SCORE_ROWS_CONTINUATION = 6`, replacing `SCORE_ROWS_PER_PAGE`.

- [ ] **Step 1: Write the failing test**

```ts
  it('fits 5 dogs on a class first page and 6 on continuations', () => {
    const model = buildModelWithEntries(12);
    const scorePages = model.pages.filter(page => page.kind === 'score-recording');
    expect(scorePages.map(page => page.entries.length)).toEqual([5, 6, 1]);
  });

  it('never splits a dog across two pages', () => {
    const model = buildModelWithEntries(12);
    const scored = model.pages
      .filter(page => page.kind === 'score-recording')
      .flatMap(page => page.entries.map(entry => entry.id));
    expect(new Set(scored).size).toBe(scored.length);
    expect(scored).toHaveLength(12);
  });

  it('emits no score pages for a class with no entries [ADDED]', () => {
    // chunksWithFirst returns [] for an empty list. A cancelled class that still
    // has a row must not produce a blank sheet in the middle of the packet.
    const model = buildModelWithEntries(0);
    expect(model.pages.filter(page => page.kind === 'score-recording')).toHaveLength(0);
  });

  it('identifies a continuation page by armband range and class', () => {
    // A page separated from its stack must still be identifiable — this
    // document is retained for a year.
    const model = buildModelWithEntries(12);
    const [, continuation] = model.pages.filter(page => page.kind === 'score-recording');
    expect(continuation.title).toMatch(/\(2\/3\)/);
    expect(continuation.context.classLabel).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/features/emergency-trial-packet/emergencyTrialPacket.test.ts`
Expected: FAIL — pages come out as `[7, 5]` from the old constant.

- [ ] **Step 3: Implement the split chunker**

Replace `SCORE_ROWS_PER_PAGE = 7` with the two constants and add a chunker that takes a different size for the first chunk:

```ts
/**
 * A class's first score page carries the full header (element, level, hides,
 * distractions, time limits) and fits one fewer dog than a continuation page,
 * which carries a compact one-line header.
 *
 * Whole blocks only: half a reason list at the bottom of a page is worse than
 * white space, so the chunker accepts a ragged bottom.
 */
const SCORE_ROWS_FIRST_PAGE = 5;
const SCORE_ROWS_CONTINUATION = 6;

function chunksWithFirst<T>(items: T[], first: number, rest: number): T[][] {
  if (items.length === 0) return [];
  const pages = [items.slice(0, first)];
  for (let index = first; index < items.length; index += rest) {
    pages.push(items.slice(index, index + rest));
  }
  return pages;
}
```

Use it at line 288 in place of `chunks(classEntries, SCORE_ROWS_PER_PAGE)`.

- [ ] **Step 4: Run the tests**

Run: `cd apps/myk9show && pnpm vitest run src/features/emergency-trial-packet/emergencyTrialPacket.test.ts`
Expected: PASS.

- [ ] **Step 5: Measure a real packet against the estimate**

The spec's 55–60 page figure is arithmetic, not measurement. Render one real trial and record the page count:

Run: `cd apps/myk9show && pnpm vitest run src/features/emergency-trial-packet/buildEmergencyTrialPacketPdf.test.ts -t "page count"`

If the block does not in fact fit 5 and 6, adjust `SCORE_BLOCK_HEIGHT_MM` and the two constants together and note the real numbers in the spec. **Do not adjust the tests to match a wrong layout.**

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/trialPacket/renderer/emergencyTrialPacket.ts \
        apps/myk9show/src/features/emergency-trial-packet/emergencyTrialPacket.test.ts
git commit -m "feat(scoresheet): paginate whole blocks, 5 first page and 6 after"
```

---

### Task 6: Reports page renders the shared PDF

**Files:**
- Create: `apps/myk9show/src/lib/reports/toScoresheetModel.ts`
- Create: `apps/myk9show/src/lib/reports/toScoresheetModel.test.ts`
- Modify: `apps/myk9show/src/lib/reports/types.ts:113-123` (`ReportDefinition`)
- Modify: `apps/myk9show/src/lib/reports/reportRegistry.ts` (the `check-in-sheet` and `scoresheet` entries)
- Modify: `apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx:159,176,184` **[EXPANDED]**
- Modify: `apps/myk9show/src/pages/secretary/ReportsPage/index.tsx:200` (print handler only)
- Modify: `apps/myk9show/src/lib/reports/__tests__/reportRegistry.test.ts` **[ADDED]**

**Interfaces:**
- Consumes: `renderEmergencyTrialPacketPdf` from `@/features/emergency-trial-packet/renderPacketPdf`.
- Produces: `toScoresheetModel(dataset: ReportDataSet, sortOrder: string): EmergencyPacketModel`; `ReportDefinition.buildPdf?`.

- [ ] **Step 1: Write the failing adapter test**

```ts
import { describe, expect, it } from 'vitest';
import { toScoresheetModel } from './toScoresheetModel';

describe('toScoresheetModel', () => {
  it('produces one class section per ReportDataSet page', () => {
    const model = toScoresheetModel(datasetWithPages(2), 'run-order');
    expect(model.pages.filter(page => page.kind === 'score-recording').length).toBeGreaterThan(0);
  });

  it('carries hides and distractions from classData into the model', () => {
    const model = toScoresheetModel(datasetWithHides(3, 2), 'run-order');
    const classRow = model.trials[0].classes[0];
    expect(classRow.numHides).toBe(3);
    expect(classRow.distractionCount).toBe(2);
  });

  it('honours the armband sort order', () => {
    const model = toScoresheetModel(datasetWithArmbands([7, 2, 5]), 'armband');
    const page = model.pages.find(p => p.kind === 'score-recording')!;
    expect(page.entries.map(entry => entry.armband)).toEqual([2, 5, 7]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/lib/reports/toScoresheetModel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the adapter and wire the registry**

`toScoresheetModel` maps `ReportDataSet.pages` (`{ trial, classData, entries }`) onto `EmergencyPacketInput`, then calls the existing model builder. The edge function keeps its own mapper — these stay separate because the *sources* differ.

Add to `ReportDefinition` in `types.ts`:

```ts
  /**
   * Present on the two reports that must also render server-side (check-in
   * sheet, scoresheet). When set, ReportsPage renders this PDF instead of
   * `component`, so the paper is byte-identical to the trial packet's.
   */
  buildPdf?: (dataset: ReportDataSet, sortOrder: string) => Uint8Array;
```

Set it on the `check-in-sheet` and `scoresheet` entries in `reportRegistry.ts`.

- [ ] **Step 4: Branch the PDF path in ReportPreview, not index [EXPANDED]**

The rendering happens in `ReportPreview.tsx`, which calls
`ReactDOMServer.renderToStaticMarkup(<ReportComponent {...props} />)` in **three** places
(lines 159, 176, 184 — single, multi-page, and class-scoped). `index.tsx:200` is only the
print handler. All three call sites need the same guard:

```tsx
if (report.buildPdf) {
  return null; // rendered by the PDF branch below, never as markup
}
```

Then add one PDF branch that builds the bytes once, wraps them in a
`Blob` with `type: 'application/pdf'`, creates an object URL, and renders an `<iframe>`.
Point `index.tsx:200`'s print handler at `iframe.contentWindow?.print()`.

Revoke the URL in a `useEffect` cleanup and whenever the dataset changes — otherwise every
re-render leaks a blob.

**Guard the missing-class case.** `ReportProps.classData` is optional, and a class-scoped
report can be opened before class data resolves. `toScoresheetModel` must return a model with
no score pages rather than dereferencing `undefined`:

```ts
if (!page.classData) continue; // no class context, no scoresheet page
```

**Guard a renderer throw.** jsPDF failing must not blank the page:

```tsx
const [pdfError, setPdfError] = useState<string | null>(null);
// ...
try {
  bytes = report.buildPdf(dataset, sortOrder);
} catch (error) {
  setPdfError(error instanceof Error ? error.message : 'Could not build the PDF.');
}
```

Render `pdfError` as an inline message with a retry, not a thrown boundary — a secretary
printing at 6am needs to know the report failed, not see an empty pane.

- [ ] **Step 4b: Update the registry test [ADDED]**

`reportRegistry.test.ts:14` renders **every** entry's component through
`renderToStaticMarkup`, and line 115 asserts phase-2 entries render non-empty. There is
already a precedent for reports that bypass the component path — the
`placeholderReportIds` list under *"official-PDF-only reports are enabled but render
directly from ReportsPage"*, which holds `armband-labels` and `result-labels`.

Add `'check-in-sheet'` and `'scoresheet'` to that list, and rename the test to say
*"render directly from ReportsPage"* covers PDF-backed reports too. Neither id is in
`PHASE_2_EXTENDED_IDS`, so line 115 is unaffected — verified, not assumed.

- [ ] **Step 5: Run the tests**

Run: `cd apps/myk9show && pnpm vitest run src/lib/reports src/pages/secretary/ReportsPage && pnpm typecheck`
Expected: PASS, including the 35-entry registry test.

- [ ] **Step 5b: Keep the render off the UI thread [ADDED]**

A 60-page jsPDF render is synchronous and will jank the Reports page. Build the PDF inside a
`useMemo` keyed on `(reportId, dataset, sortOrder)` so it runs once per selection rather than
per render, and show the existing loading state while it runs. If measurement shows the
render exceeding ~400ms, note it in the spec — do not silently ship a frozen tab.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/lib/reports apps/myk9show/src/pages/secretary/ReportsPage
git commit -m "feat(reports): render the check-in sheet and scoresheet from the shared PDF"
```

---

### Task 7: Delete the superseded React components

**Files:**
- Delete: `apps/myk9show/src/components/reports/CheckInSheet.tsx`
- Delete: `apps/myk9show/src/components/reports/ScoresheetReport.tsx`
- Delete: `apps/myk9show/src/components/reports/__tests__/CheckInSheet.test.tsx`
- Modify: `apps/myk9show/src/lib/reports/reportRegistry.ts` (drop the two imports)

**Interfaces:**
- Consumes: Task 6's `buildPdf` wiring.
- Produces: nothing.

- [ ] **Step 1: Confirm nothing else imports them**

Run: `git grep -n "CheckInSheet\|ScoresheetReport" -- '*.ts' '*.tsx'`
Expected: only `reportRegistry.ts` and the test being deleted. If anything else appears, stop and report it rather than deleting.

- [ ] **Step 2: Delete the files and their imports**

```bash
git rm apps/myk9show/src/components/reports/CheckInSheet.tsx \
       apps/myk9show/src/components/reports/ScoresheetReport.tsx \
       apps/myk9show/src/components/reports/__tests__/CheckInSheet.test.tsx
```

Remove lines 2 and 3 of `reportRegistry.ts`. The registry entries keep their ids (`check-in-sheet`, `scoresheet`) so nothing that links to a report by id breaks; `component` on those two entries becomes `PlaceholderReport`, which is never rendered because `buildPdf` takes precedence.

- [ ] **Step 3: Run the full suite, typecheck and lint**

```bash
cd apps/myk9show && pnpm test > /tmp/suite.log 2>&1; echo "EXIT=$?"
cd ../.. && pnpm typecheck > /tmp/tc.log 2>&1; echo "EXIT=$?"
pnpm lint > /tmp/lint.log 2>&1; echo "EXIT=$?"
```

Expected: all three exit 0. **Do not pipe these through `tail` or `grep`** — the pipeline reports the filter's exit code, so a red suite reports success. Redirect, read the code, then grep the file.

- [ ] **Step 4: Run the touched tests under shuffle**

CI runs vitest with `--sequence.shuffle`; local runs do not, so an order dependency passes every local run and fails randomly in CI.

```bash
cd apps/myk9show
for i in 1 2 3 4 5 6; do
  pnpm vitest run src/features/emergency-trial-packet src/lib/reports --sequence.shuffle > /tmp/shuf$i.log 2>&1
  echo "run $i EXIT=$?"
done
```

Expected: six clean runs. One pass proves nothing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(reports): delete the superseded React check-in and scoresheet components"
```

---

### Task 8: Deploy [ADDED]

Merging changes nothing on staging. The migration is not applied and the packet keeps
rendering from the previously deployed bundle. **Confirm with the user before each shared-system
write** — these are not covered by approval of the code change.

**Files:** none.

**Interfaces:**
- Consumes: everything above, merged to `main`.
- Produces: a deployed system whose behaviour matches the repo.

- [ ] **Step 1: Apply the migration**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
source supabase/.env && supabase db push --password "$SUPABASE_DB_PASSWORD"
```

- [ ] **Step 2: Verify the RPC against the applied database, not the migration text**

A correct migration file does not prove a correct result.

```sql
select jsonb_agg(distinct k)
from public.emergency_packet_input(
  'dededede-0000-0000-0000-000000000010'::uuid, '2026-08-23'::date
) input,
lateral jsonb_array_elements(input -> 'classes') cls,
lateral jsonb_object_keys(cls) k;
```

Expected: the key set contains `numHides` and `distractionCount`.

- [ ] **Step 3: Redeploy the packet function**

The shared renderer is bundled into the function; the code change does nothing until it ships.

```bash
supabase functions deploy generate-trial-packet --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
```

Confirm the output names `sojmvhhwsjxmfistvzbe`.

- [ ] **Step 4: Prove the deploy by grepping the live bundle, never by the timestamp**

Use the `get_edge_function` tool for `generate-trial-packet` and grep the returned source for
`SCORE_BLOCK_HEIGHT_MM` and one registry reason string. A deploy timestamp one minute after a
merge could have gone either way.

- [ ] **Step 5: Generate one real packet and read it**

Clear the day's claim and snapshot, POST to the function with the Vault secret, then open the
PDF and check on paper terms: the class header carries hides and distractions, a 3-area class
shows `A1/A2/A3/Total`, no per-dog block straddles a page break, and the page count is within
the range Task 5 step 5 measured. Record the real page count in the spec.

---

## Self-Review

**Spec coverage.** Registry variance → Task 1. Hides/distractions, absent from the packet type → Task 2 (a gap the spec implied but did not call out as its own work). Check-in union → Task 3. Per-dog block, result states, place, tally counters, time regions → Task 4. Pagination and the no-split rule → Task 5. Reports integration, adapter, `buildPdf`, blob preview → Task 6. Component deletion → Task 7. The spec's four required mutation checks are distributed: block height and registry lists in Task 4 step 5, `fitTextToWidth` and column width in Task 3 step 5, no-split in Task 5 step 1.

**Type consistency.** `SCORE_BLOCK_HEIGHT_MM` is exported by Task 4 and consumed by Tasks 4 and 5. `CHECK_IN_COLUMNS` is exported by Task 3 and consumed by its test. `resolveScoresheetConfig` keeps one signature throughout. `numHides`/`distractionCount` are named identically in the migration JSON keys, the renderer type, and the adapter test.

**Known soft spot.** Task 4's mutation check for registry lists cannot bite while all three registries carry identical vocabulary — the step says so explicitly and directs the engineer to differentiate one value rather than record a passing check that proves nothing.
