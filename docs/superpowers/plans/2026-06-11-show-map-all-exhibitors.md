# Show Map All Exhibitors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsed-by-default **All Exhibitors** branch to Show Map so secretaries can find a dog, see that dog's full day, and spot issues without leaving the existing tree.

**Architecture:** Extend the existing `ShowMapTree` model with synthetic `all-exhibitors`, `dog`, and `dog-entry` nodes. Build the dog branch from the same `show`, `trials`, `classes`, and `entries` inputs used by the trial branch, then teach the existing tree renderer/navigation/action helpers how to display and traverse those node types.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, shadcn/Base UI primitives already used by myK9Show.

---

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This is a production TypeScript UI/tree change inside one app that affects a secretary show-day workflow, but it does not touch shared systems, auth, database schema, payments, or replication writes.

---

## File Structure

- Modify `apps/myk9show/src/features/show-map/showMapTypes.ts`
  - Add `all-exhibitors`, `dog`, and `dog-entry` node types.
  - Add optional dog-entry display metadata to `ShowMapNode`.
- Modify `apps/myk9show/src/features/show-map/showMapTree.ts`
  - Add small helpers for dog grouping, sorting, and dog-entry labels.
  - Insert a synthetic `All Exhibitors` branch before trial nodes.
  - Keep existing default expansion and trial expansion behavior.
- Modify `apps/myk9show/src/features/show-map/showMapTreeNavigation.ts`
  - Include the new node types in keyboard tree support.
  - Preserve descendant-based filter visibility for the new branch.
- Modify `apps/myk9show/src/features/show-map/ShowMapStructureTable.tsx`
  - Render `all-exhibitors` as a top-level group row.
  - Render `dog` rows with existing non-entry row layout.
  - Render `dog-entry` rows with class/trial context.
- Modify `apps/myk9show/src/features/show-map/showMapActions.ts`
  - Mirror entry attention into matching `dog-entry` ancestors so attention filters and badges work in both branches.
  - Ensure row actions are not generated for synthetic grouping nodes.
  - Reuse entry actions for `dog-entry` only when the existing action contract can resolve the underlying entry.
- Modify tests:
  - `apps/myk9show/src/features/show-map/__tests__/showMapTree.test.ts`
  - `apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.test.tsx`
  - `apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.attrs.test.tsx`
  - `apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.keyboard.test.tsx`

---

### Task 1: Extend Tree Types With Dog Branch Metadata

**Files:**
- Modify: `apps/myk9show/src/features/show-map/showMapTypes.ts`
- Test: `apps/myk9show/src/features/show-map/__tests__/showMapTree.test.ts`

- [ ] **Step 1: Write the failing type-facing tree test**

Add this test near the top-level hierarchy tests in `showMapTree.test.ts`:

```typescript
it('adds a collapsed All Exhibitors branch before trial rows', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes,
    entries: [
      {
        id: 'entry-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        handler_id: 'person-1',
        armband: '12',
        handler: 'Jane Handler',
        dog: { id: 'dog-1', call_name: 'Bella', breed: 'Labrador Retriever' },
      },
    ],
  });

  expect(tree.childIdsByParentId[tree.root.id]).toEqual([
    'all-exhibitors:show-1',
    'trial:trial-1',
  ]);
  expect(tree.nodesById['all-exhibitors:show-1']).toMatchObject({
    id: 'all-exhibitors:show-1',
    type: 'all-exhibitors',
    label: 'All Exhibitors',
    count: 1,
    childrenCount: 1,
    isSynthetic: true,
  });
  expect(tree.childIdsByParentId['all-exhibitors:show-1']).toEqual(['dog:dog-1']);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapTree.test.ts
```

Expected: FAIL because `all-exhibitors:show-1` is not built and the node type does not exist.

- [ ] **Step 3: Extend the node type union and metadata interfaces**

In `showMapTypes.ts`, change:

```typescript
export type ShowMapNodeType = 'show' | 'trial' | 'class' | 'entry' | 'more';
```

to:

```typescript
export type ShowMapNodeType =
  | 'show'
  | 'all-exhibitors'
  | 'trial'
  | 'class'
  | 'dog'
  | 'entry'
  | 'dog-entry'
  | 'more';
```

Add this interface below `ShowMapEntryDisplay`:

```typescript
export interface ShowMapDogEntryDisplay {
  entryId: string;
  classId?: string | undefined;
  classLabel: string;
  trialId?: string | undefined;
  trialLabel?: string | undefined;
  trialDate?: string | undefined;
  ringLabel?: string | undefined;
  judgeName?: string | undefined;
  startTime?: string | undefined;
}
```

Add this optional field to `ShowMapNode`:

```typescript
  dogEntryDisplay?: ShowMapDogEntryDisplay | undefined;
```

- [ ] **Step 4: Run the focused test and verify it still fails at runtime**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapTree.test.ts
```

Expected: FAIL only because tree construction has not added the new branch yet.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/show-map/showMapTypes.ts apps/myk9show/src/features/show-map/__tests__/showMapTree.test.ts
git commit -m "test(show-map): expect all exhibitors branch"
```

---

### Task 2: Build The All Exhibitors Branch

**Files:**
- Modify: `apps/myk9show/src/features/show-map/showMapTree.ts`
- Test: `apps/myk9show/src/features/show-map/__tests__/showMapTree.test.ts`

- [ ] **Step 1: Add grouping and sorting tests**

Add these tests to `showMapTree.test.ts`:

```typescript
it('groups dog entries and sorts dog rows by armband then dog name', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes,
    entries: [
      {
        id: 'entry-ranger',
        class_id: 'class-1',
        dog_id: 'dog-ranger',
        armband: '22',
        handler: 'Pat Handler',
        dog: { id: 'dog-ranger', call_name: 'Ranger', breed: 'Beagle' },
      },
      {
        id: 'entry-bella',
        class_id: 'class-1',
        dog_id: 'dog-bella',
        armband: '14',
        handler: 'Jane Handler',
        dog: { id: 'dog-bella', call_name: 'Bella', breed: 'Labrador Retriever' },
      },
      {
        id: 'entry-ace',
        class_id: 'class-1',
        dog_id: 'dog-ace',
        armband: '14',
        handler: 'Sam Handler',
        dog: { id: 'dog-ace', call_name: 'Ace', breed: 'Mixed Breed' },
      },
    ],
  });

  expect(tree.childIdsByParentId['all-exhibitors:show-1']).toEqual([
    'dog:dog-ace',
    'dog:dog-bella',
    'dog:dog-ranger',
  ]);
  expect(tree.nodesById['dog:dog-ace']).toMatchObject({
    type: 'dog',
    label: '#14 Ace',
    subtitle: 'Sam Handler · Mixed Breed',
    count: 1,
    childrenCount: 1,
  });
});

it('shows dog-entry children with class and trial context', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes: [
      {
        ...classes[0]!,
        ring: 2,
        judgeName: 'Judge Judy',
        time: '09:30',
        trialName: 'Morning Trial',
      },
    ],
    entries: [
      {
        id: 'entry-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        armband: '12',
        handler: 'Jane Handler',
        dog: { id: 'dog-1', call_name: 'Bella', breed: 'Labrador Retriever' },
      },
    ],
  });

  expect(tree.childIdsByParentId['dog:dog-1']).toEqual(['dog-entry:entry-1']);
  expect(tree.nodesById['dog-entry:entry-1']).toMatchObject({
    type: 'dog-entry',
    label: 'Interior Novice A',
    subtitle: 'Spring Trial · 2026-05-11 · Ring 2 · Judge Judy · 09:30',
    dogEntryDisplay: {
      entryId: 'entry-1',
      classId: 'class-1',
      classLabel: 'Interior Novice A',
      trialId: 'trial-1',
      trialLabel: 'Spring Trial',
      trialDate: '2026-05-11',
      ringLabel: 'Ring 2',
      judgeName: 'Judge Judy',
      startTime: '09:30',
    },
  });
});
```

- [ ] **Step 2: Add edge-case fallback tests [ADDED]**

Add these tests to `showMapTree.test.ts`:

```typescript
it('uses stable fallback dog rows when an entry has no dog id or name', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes,
    entries: [
      {
        id: 'entry-unknown',
        class_id: 'class-1',
        armband: '99',
      },
    ],
  });

  expect(tree.childIdsByParentId['all-exhibitors:show-1']).toEqual([
    'dog:unknown-entry:entry-unknown',
  ]);
  expect(tree.nodesById['dog:unknown-entry:entry-unknown']).toMatchObject({
    type: 'dog',
    label: '#99 Unknown dog',
    count: 1,
    childrenCount: 1,
  });
});

it('keeps dog-entry rows visible when class or trial context is missing', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes,
    entries: [
      {
        id: 'entry-missing-class',
        class_id: 'missing-class',
        dog_id: 'dog-1',
        dog: { id: 'dog-1', call_name: 'Bella' },
      },
    ],
  });

  expect(tree.childIdsByParentId['dog:dog-1']).toEqual(['dog-entry:entry-missing-class']);
  expect(tree.nodesById['dog-entry:entry-missing-class']).toMatchObject({
    type: 'dog-entry',
    label: 'Unknown class',
    subtitle: undefined,
    dogEntryDisplay: {
      entryId: 'entry-missing-class',
      classLabel: 'Unknown class',
    },
  });
});
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapTree.test.ts
```

Expected: FAIL because dog branch helpers are not implemented.

- [ ] **Step 4: Import the new display and input types [EXPANDED]**

In `showMapTree.ts`, extend the existing type import:

```typescript
import type {
  BuildShowMapTreeInput,
  ShowMapDisplayStatus,
  ShowMapDogEntryDisplay,
  ShowMapEntryDisplay,
  ShowMapEntryInput,
  ShowMapClassInput,
  ShowMapNode,
  ShowMapNodeType,
  ShowMapTrialInput,
  ShowMapTree,
} from './showMapTypes';
```

- [ ] **Step 5: Add dog branch helper types and readers**

Add these helpers below `entryClassId`:

```typescript
interface DogBranchEntry {
  dogKey: string;
  dogId?: string | undefined;
  entry: ShowMapEntryInput;
  display: ShowMapEntryDisplay;
}

function normalizeDogKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function entryDogKey(entry: ShowMapEntryInput): string | undefined {
  const dogId = entryDogId(entry);
  if (dogId) return dogId;
  const dogName = entryDogName(entry);
  if (dogName) return `unknown:${normalizeDogKeyPart(dogName)}`;
  const entryId = readString(entry, 'id');
  return entryId ? `unknown-entry:${entryId}` : undefined;
}
```

- [ ] **Step 6: Add dog label, subtitle, and sort helpers [EXPANDED]**

Add these helpers below `entryLabel`:

```typescript
function dogLabel(display: ShowMapEntryDisplay): string {
  const dogName = display.dogName === 'Unknown' ? 'Unknown dog' : display.dogName;
  if (display.armband && dogName) return `#${display.armband} ${dogName}`;
  if (display.armband) return `#${display.armband}`;
  return dogName;
}

function dogSubtitle(display: ShowMapEntryDisplay): string | undefined {
  return [display.handler, display.breed].filter(Boolean).join(' · ') || undefined;
}

function armbandSortValue(display: ShowMapEntryDisplay): number {
  if (!display.armband) return Number.POSITIVE_INFINITY;
  const parsed = Number.parseInt(display.armband, 10);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function sortDogBranchEntries(entries: DogBranchEntry[]): DogBranchEntry[] {
  return [...entries].sort((a, b) => {
    const armbandA = armbandSortValue(a.display);
    const armbandB = armbandSortValue(b.display);
    if (armbandA !== armbandB) return armbandA - armbandB;
    const dogName = a.display.dogName.localeCompare(b.display.dogName);
    if (dogName !== 0) return dogName;
    const handler = (a.display.handler ?? '').localeCompare(b.display.handler ?? '');
    if (handler !== 0) return handler;
    return a.dogKey.localeCompare(b.dogKey);
  });
}
```

- [ ] **Step 7: Add class/trial context helpers**

Add these helpers below `classRingLabel`:

```typescript
function classLabel(cls: ShowMapClassInput | undefined): string {
  if (!cls) return 'Unknown class';
  return cls.name || [cls.element, cls.level, cls.section].filter(Boolean).join(' ') || 'Unknown class';
}

function trialLabel(trial: ShowMapTrialInput | undefined): string | undefined {
  if (!trial) return undefined;
  return trial.name || (trial.trialNumber ? `Trial ${trial.trialNumber}` : undefined);
}

function dogEntryDisplayFor(
  entry: ShowMapEntryInput,
  cls: ShowMapClassInput | undefined,
  trial: ShowMapTrialInput | undefined
): ShowMapDogEntryDisplay | undefined {
  const entryId = readString(entry, 'id');
  if (!entryId) return undefined;
  const ringLabel = cls ? classRingLabel(cls) : undefined;
  return {
    entryId,
    classId: cls?.id,
    classLabel: classLabel(cls),
    trialId: trial?.id,
    trialLabel: trialLabel(trial),
    trialDate: trial?.trialDate || cls?.trialDate,
    ringLabel,
    judgeName: cls?.judgeName || undefined,
    startTime: cls?.time || undefined,
  };
}

function dogEntrySubtitle(display: ShowMapDogEntryDisplay): string | undefined {
  return [
    display.trialLabel,
    display.trialDate,
    display.ringLabel,
    display.judgeName,
    display.startTime,
  ]
    .filter(Boolean)
    .join(' · ') || undefined;
}
```

- [ ] **Step 8: Add lookup maps while building the tree**

Inside `buildShowMapTree`, after `classesByTrialId` is built, add:

```typescript
  const classById = new Map(classes.map(cls => [cls.id, cls]));
  const trialById = new Map(trials.map(trial => [trial.id, trial]));

  const dogEntriesByKey = new Map<string, DogBranchEntry[]>();
  for (const entry of entries) {
    const dogKey = entryDogKey(entry);
    if (!dogKey) continue;
    const display = entryDisplay(entry, show.organization);
    const dogEntries = dogEntriesByKey.get(dogKey) ?? [];
    dogEntries.push({
      dogKey,
      dogId: display.dogId,
      entry,
      display,
    });
    dogEntriesByKey.set(dogKey, dogEntries);
  }
```

- [ ] **Step 9: Insert the All Exhibitors branch before trial nodes**

After `tree` is initialized and before the `for (const trial of trials)` loop, add:

```typescript
  if (dogEntriesByKey.size > 0) {
    const allExhibitorsNode: ShowMapNode = {
      id: getShowMapNodeId('all-exhibitors', show.id),
      type: 'all-exhibitors',
      label: 'All Exhibitors',
      subtitle: `${dogEntriesByKey.size} dogs · ${entries.length} entries`,
      count: dogEntriesByKey.size,
      attentionCount: entries.filter(entry => getEntryAttention(entry) !== null).length,
      parentId: root.id,
      childrenCount: dogEntriesByKey.size,
      isSynthetic: true,
    };
    addNode(tree, allExhibitorsNode);

    const sortedDogGroups = Array.from(dogEntriesByKey.entries())
      .map(([dogKey, dogEntries]) => ({
        dogKey,
        entries: sortDogBranchEntries(dogEntries),
      }))
      .sort((a, b) => {
        const firstA = a.entries[0]!;
        const firstB = b.entries[0]!;
        return sortDogBranchEntries([firstA, firstB])[0] === firstA ? -1 : 1;
      });

    for (const group of sortedDogGroups) {
      const first = group.entries[0]!;
      const dogNodeId = getShowMapNodeId('dog', group.dogKey);
      const dogAttentionCount = group.entries.filter(
        item => getEntryAttention(item.entry) !== null
      ).length;
      const completedDogEntries = group.entries.filter(item => isEntryComplete(item.entry)).length;

      addNode(tree, {
        id: dogNodeId,
        type: 'dog',
        label: dogLabel(first.display),
        subtitle: dogSubtitle(first.display),
        count: group.entries.length,
        progress: buildProgress(completedDogEntries, group.entries.length, 'entries'),
        attentionCount: dogAttentionCount,
        parentId: allExhibitorsNode.id,
        childrenCount: group.entries.length,
        isSynthetic: true,
      });

      for (const item of sortEntries(group.entries.map(groupItem => groupItem.entry))) {
        const entryId = readString(item, 'id');
        if (!entryId) continue;
        const cls = classById.get(entryClassId(item) ?? '');
        const trial = cls ? trialById.get(cls.trialId) : undefined;
        const display = dogEntryDisplayFor(item, cls, trial);
        if (!display) continue;
        addNode(tree, {
          id: getShowMapNodeId('dog-entry', entryId),
          type: 'dog-entry',
          label: display.classLabel,
          subtitle: dogEntrySubtitle(display),
          dogEntryDisplay: display,
          status: classifyEntryRunStatus(item),
          checkInStatus: classifyEntryCheckInStatus(item),
          trialDate: display.trialDate,
          timezone: trial?.timezone,
          parentId: dogNodeId,
          childrenCount: 0,
          isSynthetic: true,
        });
      }
    }
  }
```

Before finalizing this step, simplify the `sortedDogGroups` comparator if TypeScript complains about non-transitive comparison. Use this explicit sort key instead:

```typescript
function compareDogBranchEntries(a: DogBranchEntry, b: DogBranchEntry): number {
  const armbandA = armbandSortValue(a.display);
  const armbandB = armbandSortValue(b.display);
  if (armbandA !== armbandB) return armbandA - armbandB;
  const dogName = a.display.dogName.localeCompare(b.display.dogName);
  if (dogName !== 0) return dogName;
  const handler = (a.display.handler ?? '').localeCompare(b.display.handler ?? '');
  if (handler !== 0) return handler;
  return a.dogKey.localeCompare(b.dogKey);
}
```

Then implement `sortDogBranchEntries` as:

```typescript
function sortDogBranchEntries(entries: DogBranchEntry[]): DogBranchEntry[] {
  return [...entries].sort(compareDogBranchEntries);
}
```

and sort groups with:

```typescript
      .sort((a, b) => compareDogBranchEntries(a.entries[0]!, b.entries[0]!));
```

- [ ] **Step 10: Run the focused test and verify it passes**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapTree.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/myk9show/src/features/show-map/showMapTree.ts apps/myk9show/src/features/show-map/__tests__/showMapTree.test.ts
git commit -m "feat(show-map): build all exhibitors branch"
```

---

### Task 3: Preserve Expansion And Filtering Semantics

**Files:**
- Modify: `apps/myk9show/src/features/show-map/showMapTreeNavigation.ts`
- Modify: `apps/myk9show/src/features/show-map/showMapActions.ts`
- Test: `apps/myk9show/src/features/show-map/__tests__/showMapTree.test.ts`
- Test: `apps/myk9show/src/features/show-map/__tests__/showMapActions.test.ts`
- Test: `apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.emptyState.test.tsx`

- [ ] **Step 1: Add expansion tests**

Add this test to `showMapTree.test.ts`:

```typescript
it('keeps dog branch collapsed by default and out of expand-trials', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes,
    entries: [
      {
        id: 'entry-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        dog: { id: 'dog-1', call_name: 'Bella' },
      },
    ],
  });

  expect(getDefaultExpandedNodeIds(tree)).toEqual(new Set([tree.root.id]));
  expect(getTrialsExpandedNodeIds(tree)).toEqual(new Set([tree.root.id, 'trial:trial-1']));
});
```

- [ ] **Step 2: Add attention filter rendering test**

Add this test to `ShowMapStructureTable.emptyState.test.tsx` or `ShowMapStructureTable.test.tsx`, whichever already contains the closest filter tests:

```typescript
it('keeps All Exhibitors and matching dog ancestors visible under needs-attention filter', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes,
    entries: [
      {
        id: 'entry-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        dog: { id: 'dog-1', call_name: 'Bella' },
        entry_status: 'waitlisted',
      },
    ],
  });
  const expandedNodeIds = new Set([
    tree.root.id,
    'all-exhibitors:show-1',
    'dog:dog-1',
  ]);

  render(
    <ShowMapStructureTable
      tree={tree}
      expandedNodeIds={expandedNodeIds}
      filter="needs-attention"
      onToggle={vi.fn()}
    />
  );

  expect(screen.getByText('All Exhibitors')).toBeInTheDocument();
  expect(screen.getByText('Bella')).toBeInTheDocument();
  expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
});
```

Use the existing test file's `render` import pattern. If the file uses `render` from `@/test/utils/testUtils`, keep that; do not import raw Testing Library render.

- [ ] **Step 3: Add action-level attention mirroring test [ADDED]**

Add this test to `showMapActions.test.ts`:

```typescript
it('mirrors entry attention into the matching dog branch ancestors', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes,
    entries: [
      {
        id: 'entry-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        dog: { id: 'dog-1', call_name: 'Bella' },
        entry_status: 'submitted',
      },
    ],
  });

  const attentionNodeIds = getAttentionNodeIds(tree);
  expect(Array.from(attentionNodeIds)).toEqual(
    expect.arrayContaining([
      'all-exhibitors:show-1',
      'dog:dog-1',
      'dog-entry:entry-1',
    ])
  );

  const counts = getAttentionCountsByNodeId(tree);
  expect(counts.get('all-exhibitors:show-1')).toBe(1);
  expect(counts.get('dog:dog-1')).toBe(1);
  expect(counts.get('dog-entry:entry-1')).toBe(1);
});
```

- [ ] **Step 4: Run the focused tests and verify the attention tests fail**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapTree.test.ts src/features/show-map/__tests__/showMapActions.test.ts src/features/show-map/__tests__/ShowMapStructureTable.emptyState.test.tsx
```

Expected: tree expansion tests pass after Task 2; attention mirroring and render/filter tests fail until action and renderer support are added.

- [ ] **Step 5: Add keyboard support for new node types**

In `showMapTreeNavigation.ts`, change:

```typescript
export function supportsTreeKeyboardActions(node: ShowMapNode): boolean {
  return node.type === 'trial' || node.type === 'class' || node.type === 'entry';
}
```

to:

```typescript
export function supportsTreeKeyboardActions(node: ShowMapNode): boolean {
  return (
    node.type === 'all-exhibitors' ||
    node.type === 'trial' ||
    node.type === 'class' ||
    node.type === 'dog' ||
    node.type === 'entry' ||
    node.type === 'dog-entry'
  );
}
```

No custom filter traversal is needed if `shouldRenderShowMapNode` already uses descendant matching; the new node types should inherit that behavior.

- [ ] **Step 6: Mirror entry attention into the dog branch [ADDED]**

In `showMapActions.ts`, add this helper near `getAttentionNodeIds`:

```typescript
function addNodeAndAncestors(
  tree: ShowMapTree,
  nodeId: string,
  visit: (nodeId: string) => void
): void {
  let node: ShowMapNode | undefined = tree.nodesById[nodeId];
  while (node) {
    visit(node.id);
    node = node.parentId ? tree.nodesById[node.parentId] : undefined;
  }
}

function getMirroredDogEntryNodeId(tree: ShowMapTree, actionNodeId: string): string | undefined {
  const entryId = sourceIdFromNodeId(actionNodeId, 'entry');
  if (!entryId) return undefined;
  const dogEntryNodeId = `dog-entry:${entryId}`;
  return tree.nodesById[dogEntryNodeId] ? dogEntryNodeId : undefined;
}
```

Then replace the ancestor loop inside `getAttentionNodeIds` with:

```typescript
  for (const action of getAttentionActions('root', { tree, ...state })) {
    addNodeAndAncestors(tree, action.nodeId, nodeId => nodeIds.add(nodeId));
    const dogEntryNodeId = getMirroredDogEntryNodeId(tree, action.nodeId);
    if (dogEntryNodeId) {
      addNodeAndAncestors(tree, dogEntryNodeId, nodeId => nodeIds.add(nodeId));
    }
  }
```

Replace the second ancestor loop inside `getAttentionCountsByNodeId` with:

```typescript
  for (const directId of directNodeIds) {
    addNodeAndAncestors(tree, directId, nodeId => {
      counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
    });
    const dogEntryNodeId = getMirroredDogEntryNodeId(tree, directId);
    if (dogEntryNodeId) {
      addNodeAndAncestors(tree, dogEntryNodeId, nodeId => {
        counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
      });
    }
  }
```

This mirrors only entry-level attention into the by-dog branch. Class/trial wrap-up attention remains trial-branch operational work and should not create dog issues.

- [ ] **Step 7: Run the focused tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapTree.test.ts src/features/show-map/__tests__/showMapActions.test.ts src/features/show-map/__tests__/ShowMapStructureTable.emptyState.test.tsx
```

Expected: PASS once renderer support from Task 4 is complete. If this task is executed before Task 4, note the expected render failure and continue.

- [ ] **Step 8: Commit after renderer support lands**

```bash
git add apps/myk9show/src/features/show-map/showMapTreeNavigation.ts apps/myk9show/src/features/show-map/showMapActions.ts apps/myk9show/src/features/show-map/__tests__/showMapTree.test.ts apps/myk9show/src/features/show-map/__tests__/showMapActions.test.ts apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.emptyState.test.tsx
git commit -m "feat(show-map): preserve dog branch tree filters"
```

---

### Task 4: Render Dog Branch Rows

**Files:**
- Modify: `apps/myk9show/src/features/show-map/ShowMapStructureTable.tsx`
- Test: `apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.test.tsx`
- Test: `apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.attrs.test.tsx`
- Test: `apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.keyboard.test.tsx`

- [ ] **Step 1: Add rendering test for expanded All Exhibitors branch**

Add this test to `ShowMapStructureTable.test.tsx`:

```typescript
it('renders expanded All Exhibitors dog rows and dog-entry class context', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes: [
      {
        ...classes[0]!,
        ring: 2,
        judgeName: 'Judge Judy',
        time: '09:30',
      },
    ],
    entries: [
      {
        id: 'entry-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        armband: '12',
        handler: 'Jane Handler',
        dog: { id: 'dog-1', call_name: 'Bella', breed: 'Labrador Retriever' },
      },
    ],
  });

  render(
    <ShowMapStructureTable
      tree={tree}
      expandedNodeIds={new Set([tree.root.id, 'all-exhibitors:show-1', 'dog:dog-1'])}
      filter="all"
      onToggle={vi.fn()}
    />
  );

  expect(screen.getByText('All Exhibitors')).toBeInTheDocument();
  expect(screen.getByText('#12 Bella')).toBeInTheDocument();
  expect(screen.getByText('Jane Handler · Labrador Retriever')).toBeInTheDocument();
  expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
  expect(screen.getByText('Spring Trial · 2026-05-11 · Ring 2 · Judge Judy · 09:30')).toBeInTheDocument();
});
```

- [ ] **Step 2: Add attribute test for new node types**

Add this test to `ShowMapStructureTable.attrs.test.tsx`:

```typescript
it('adds data-node attributes and ARIA levels for all exhibitors branch rows', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes,
    entries: [
      {
        id: 'entry-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        dog: { id: 'dog-1', call_name: 'Bella' },
      },
    ],
  });

  render(
    <ShowMapStructureTable
      tree={tree}
      expandedNodeIds={new Set([tree.root.id, 'all-exhibitors:show-1', 'dog:dog-1'])}
      filter="all"
      onToggle={vi.fn()}
    />
  );

  expect(screen.getByText('All Exhibitors').closest('[role="treeitem"]')).toMatchObject({
    dataset: expect.objectContaining({
      nodeId: 'all-exhibitors:show-1',
      nodeType: 'all-exhibitors',
    }),
  });
  expect(screen.getByText('Bella').closest('[role="treeitem"]')).toHaveAttribute('aria-level', '2');
  expect(screen.getByText('Interior Novice A').closest('[role="treeitem"]')).toHaveAttribute(
    'aria-level',
    '3'
  );
});
```

If the test cannot use `toMatchObject` on `dataset`, split it into explicit assertions:

```typescript
const allExhibitorsRow = screen.getByText('All Exhibitors').closest('[role="treeitem"]');
expect(allExhibitorsRow).toHaveAttribute('data-node-id', 'all-exhibitors:show-1');
expect(allExhibitorsRow).toHaveAttribute('data-node-type', 'all-exhibitors');
```

- [ ] **Step 3: Add keyboard navigation test**

Add this test to `ShowMapStructureTable.keyboard.test.tsx`:

```typescript
it('includes all exhibitors, dog, and dog-entry rows in roving keyboard navigation', async () => {
  const user = userEvent.setup();
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes,
    entries: [
      {
        id: 'entry-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        dog: { id: 'dog-1', call_name: 'Bella' },
      },
    ],
  });

  render(
    <ShowMapStructureTable
      tree={tree}
      expandedNodeIds={new Set([tree.root.id, 'all-exhibitors:show-1', 'dog:dog-1'])}
      filter="all"
      onToggle={vi.fn()}
    />
  );

  const allExhibitorsRow = screen.getByText('All Exhibitors').closest('[role="treeitem"]');
  expect(allExhibitorsRow).toHaveAttribute('tabindex', '0');

  await user.keyboard('{ArrowDown}');
  expect(screen.getByText('Bella').closest('[role="treeitem"]')).toHaveFocus();

  await user.keyboard('{ArrowDown}');
  expect(screen.getByText('Interior Novice A').closest('[role="treeitem"]')).toHaveFocus();
});
```

Adjust the first focus step to call `allExhibitorsRow?.focus()` if the existing keyboard tests explicitly focus the first row before sending keys.

- [ ] **Step 4: Run rendering tests and verify they fail**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/ShowMapStructureTable.test.tsx src/features/show-map/__tests__/ShowMapStructureTable.attrs.test.tsx src/features/show-map/__tests__/ShowMapStructureTable.keyboard.test.tsx
```

Expected: FAIL because `dog-entry` rows still render through the generic non-entry branch and keyboard support may be incomplete.

- [ ] **Step 5: Add a dog-entry identity renderer**

In `ShowMapStructureTable.tsx`, add this component below `EntryIdentity`:

```typescript
function DogEntryIdentity({ node }: { node: ShowMapNode }) {
  const display = node.dogEntryDisplay;
  if (!display) {
    return <span className="block truncate text-sm font-semibold">{node.label}</span>;
  }

  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-semibold">{display.classLabel}</div>
      {node.subtitle && (
        <div className="truncate text-xs text-muted-foreground">{node.subtitle}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Render dog-entry rows with the entry row visual density**

In `renderNode`, change the entry branch condition from:

```typescript
    if (node.type === 'entry') {
```

to:

```typescript
    if (node.type === 'entry' || node.type === 'dog-entry') {
```

Inside that branch, change the identity render from:

```tsx
            <EntryIdentity
              node={node}
              onNavigate={isAnyReorderActive ? undefined : onNavigate}
            />
```

to:

```tsx
            {node.type === 'dog-entry' ? (
              <DogEntryIdentity node={node} />
            ) : (
              <EntryIdentity
                node={node}
                onNavigate={isAnyReorderActive ? undefined : onNavigate}
              />
            )}
```

- [ ] **Step 7: Render All Exhibitors as a top-level card row**

Change the trial-specific wrapper condition:

```typescript
    if (node.type === 'trial') {
```

to:

```typescript
    if (node.type === 'trial' || node.type === 'all-exhibitors') {
```

This intentionally gives **All Exhibitors** the same top-level visual weight as trials.

- [ ] **Step 8: Ensure dog rows use the generic class-like row**

No separate dog branch is needed if `node.type === 'dog'` falls through to the existing generic non-trial/non-entry branch. Confirm dog rows show label, subtitle, status, progress, and row action area.

- [ ] **Step 9: Run focused rendering tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/ShowMapStructureTable.test.tsx src/features/show-map/__tests__/ShowMapStructureTable.attrs.test.tsx src/features/show-map/__tests__/ShowMapStructureTable.keyboard.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/myk9show/src/features/show-map/ShowMapStructureTable.tsx apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.test.tsx apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.attrs.test.tsx apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.keyboard.test.tsx
git commit -m "feat(show-map): render all exhibitors branch"
```

---

### Task 5: Keep Row Actions Safe For Synthetic Nodes

**Files:**
- Modify: `apps/myk9show/src/features/show-map/showMapActions.ts`
- Modify: `apps/myk9show/src/features/show-map/ShowMapRowActionsMenu.tsx` if needed after inspection
- Test: `apps/myk9show/src/features/show-map/__tests__/showMapActions.test.ts`
- Test: `apps/myk9show/src/features/show-map/__tests__/ShowMapRowActionsMenu.test.tsx`

- [ ] **Step 1: Inspect current action guards**

Run:

```bash
rg -n "node\\.type|entryDisplay|type === 'entry'|ShowMapNodeType" apps/myk9show/src/features/show-map/showMapActions.ts apps/myk9show/src/features/show-map/ShowMapRowActionsMenu.tsx
```

Expected: identify where actions are generated for trial/class/entry nodes.

- [ ] **Step 2: Add action test for synthetic nodes**

In `showMapActions.test.ts`, add:

```typescript
it('does not generate operational actions for synthetic all-exhibitors or dog nodes', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes,
    entries: [
      {
        id: 'entry-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        dog: { id: 'dog-1', call_name: 'Bella' },
      },
    ],
  });

  expect(getRankedActions('all-exhibitors:show-1', { tree })).toEqual([]);
  expect(getRankedActions('dog:dog-1', { tree })).toEqual([]);
});
```

Use the exact exported action function names already used in that test file. If `getRankedActions` is not used for row menus, add the equivalent assertion against the local action builder used by `ShowMapRowActionsMenu`.

- [ ] **Step 3: Add menu rendering test**

In `ShowMapRowActionsMenu.test.tsx`, add:

```typescript
it('renders no synthetic-node actions for All Exhibitors', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes,
    entries: [
      {
        id: 'entry-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        dog: { id: 'dog-1', call_name: 'Bella' },
      },
    ],
  });
  const node = tree.nodesById['all-exhibitors:show-1']!;

  render(
    <ShowMapRowActionsMenu
      node={node}
      tree={tree}
      scopeNow={new Date('2026-05-11T12:00:00Z')}
      onNavigate={vi.fn()}
      onAction={vi.fn()}
    />
  );

  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
```

If the menu intentionally always renders a disabled trigger, assert that opening it shows no action menuitems instead:

```typescript
expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
```

- [ ] **Step 4: Run action tests and verify failures**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapActions.test.ts src/features/show-map/__tests__/ShowMapRowActionsMenu.test.tsx
```

Expected: FAIL if synthetic nodes currently receive row actions or menu triggers.

- [ ] **Step 5: Guard synthetic grouping nodes in action builders**

In `showMapActions.ts`, add an early return wherever row actions are built from a `ShowMapNode`:

```typescript
if (node.type === 'all-exhibitors' || node.type === 'dog' || node.type === 'more') {
  return [];
}
```

For `dog-entry`, either map it to the underlying entry action contract by `node.dogEntryDisplay.entryId`, or return no actions for this slice. Prefer no actions if the current action builders assume `node.type === 'entry'` and `node.entryDisplay` is present. The trial branch still gives access to full entry actions.

- [ ] **Step 6: Hide menu trigger when no actions exist**

If `ShowMapRowActionsMenu` renders an empty trigger, update it to return `null` when the computed action list is empty:

```typescript
if (actions.length === 0) {
  return null;
}
```

Use the existing local variable name for the action list.

- [ ] **Step 7: Run action tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapActions.test.ts src/features/show-map/__tests__/ShowMapRowActionsMenu.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/features/show-map/showMapActions.ts apps/myk9show/src/features/show-map/ShowMapRowActionsMenu.tsx apps/myk9show/src/features/show-map/__tests__/showMapActions.test.ts apps/myk9show/src/features/show-map/__tests__/ShowMapRowActionsMenu.test.tsx
git commit -m "fix(show-map): suppress synthetic dog branch actions"
```

---

### Task 6: Verify Integration And Update Tracking

**Files:**
- Modify: `OPEN-TODOS.md`
- Modify: `docs/superpowers/plans/2026-06-11-show-map-all-exhibitors.md` if execution notes are needed

- [ ] **Step 1: Run all focused Show Map tests**

Run:

```bash
cd apps/myk9show && npx vitest run \
  src/features/show-map/__tests__/showMapTree.test.ts \
  src/features/show-map/__tests__/ShowMapStructureTable.test.tsx \
  src/features/show-map/__tests__/ShowMapStructureTable.attrs.test.tsx \
  src/features/show-map/__tests__/ShowMapStructureTable.keyboard.test.tsx \
  src/features/show-map/__tests__/ShowMapStructureTable.emptyState.test.tsx \
  src/features/show-map/__tests__/showMapActions.test.ts \
  src/features/show-map/__tests__/ShowMapRowActionsMenu.test.tsx
```

Expected: PASS. If the command hangs for more than 60 seconds, stop it and record the hang.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If the full typecheck hangs for more than 60 seconds, stop it and record the hang.

- [ ] **Step 3: Run a final static search**

Run:

```bash
rg -n "all-exhibitors|dog-entry|ShowMapNodeType" apps/myk9show/src/features/show-map
```

Expected: all new node type usage is confined to Show Map tree/build/render/action/test files.

- [ ] **Step 4: Update `OPEN-TODOS.md`**

Replace the open Show Map todo line:

```markdown
- [ ] **Add "All Exhibitors" by-dog view to Show Map** — A collapsible top-level row that lists every dog (exhibitor) in the show; expanding a dog row shows that dog's class entries — a dog-pivot of the existing `trial → class → entry` tree (`All Exhibitors | dog | entries` vs `trials | classes | entries`). Mirrors myK9Q's home-page exhibitor list. Reuse the show-map tree primitives, don't fetch new data. Files: `apps/myk9show/src/features/show-map/showMapTree.ts`, `showMapTypes.ts`, `ShowMapStructureTable.tsx`, `ShowMapTab.tsx`. Full context in TO-DOS.md § "All Exhibitors by-dog view on Show Map".
```

with:

```markdown
- [x] ~~**Add "All Exhibitors" by-dog view to Show Map**~~ — Implemented in branch `codex/show-map-all-exhibitors`: Show Map now has a collapsed-by-default synthetic **All Exhibitors** branch above trial rows, grouping entries by dog and showing each dog's class/trial context from the existing tree inputs with no new fetches. Focused Show Map tests and typecheck pass.
```

- [ ] **Step 5: Run Markdown/static checks for tracking update**

Run:

```bash
git diff --check
rg -n "Add \"All Exhibitors\" by-dog view to Show Map|All Exhibitors" OPEN-TODOS.md docs/superpowers/specs/2026-06-11-show-map-all-exhibitors-design.md
```

Expected: no whitespace errors; `OPEN-TODOS.md` shows the completed todo and the design spec still exists.

- [ ] **Step 6: Commit final tracking update**

```bash
git add OPEN-TODOS.md docs/superpowers/plans/2026-06-11-show-map-all-exhibitors.md
git commit -m "docs(show-map): close all exhibitors todo"
```

---

## Plan Self-Review

Spec coverage:

- Inline **All Exhibitors** branch: Tasks 1, 2, and 4.
- No new fetches: Task 2 builds from existing inputs only.
- Calm default expansion: Task 3.
- Existing filters and attention ancestry: Task 3.
- ARIA/tree/data attributes: Task 4.
- Synthetic action safety: Task 5.
- Focused tests and typecheck: Task 6.
- Tracking update: Task 6.

Placeholder scan:

- No `TBD`, `TODO`, or "implement later" language remains.
- Ambiguous "if needed" cases include explicit fallback assertions or exact commands.

Type consistency:

- New node types are `all-exhibitors`, `dog`, and `dog-entry`.
- New display type is `ShowMapDogEntryDisplay`.
- New node metadata field is `dogEntryDisplay`.
