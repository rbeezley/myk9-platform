# Wave 2 Cross-Role Seam Recovery Implementation Plan

> **Status:** Active

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead ends and state disagreement where exhibitors and secretaries interact, without adding duplicate messaging, pull, refund, or show-day surfaces.

**Architecture:** Keep every fix on an existing surface. Exhibitor questions and post-deadline recovery route into the existing message system; secretary contact actions deep-link into the existing Message Center or Communication History; refund/withdrawal state reuses existing entry/payment status mapping. Fixture-only seam proof is deferred to Wave 5 unless the user explicitly approves shared Supabase seed mutations.

**Tech Stack:** React, TypeScript, React Router, Zustand, Supabase, Vitest, React Testing Library, myK9Show shadcn/base UI components.

---

## Validation Profile

- **Risk:** Medium
- **Validation:** App-level
- **Rationale:** Wave 2 changes user-facing messaging, status, and navigation seams in myK9Show without DB migrations, payment mutations, auth/RLS changes, or shared-system writes. Use focused unit/component tests, app typecheck/lint, and a browser seam re-walk.

## Context

**Source audit:** `docs/audits/2026-06-ux-journeys/SUMMARY.md`

**Seam evidence:** `docs/audits/2026-06-ux-journeys/03-cross-role-seams.md`

**Wave 2 findings:**

- `UX-P1-02`: Exhibitor has no post-deadline pull/scratch request or contact path.
- `UX-P1-03`: Exhibitor `/messages/:showId` can render blank main content.
- `UX-P1-04`: Withdrawn/refunded entry disagrees across secretary and exhibitor surfaces.
- `UX-P2-10`: Message Center compose does not inherit show context.
- `UX-P2-13`: Row-level message fallback is absent for the observed Show Map entry.

**Intent check:** `docs/INTENT.md` defines the exhibitor target feeling as "This respects my time" and the trial secretary target feeling as "That was easy." Wave 2 should make cross-role recovery obvious while preserving calm, low-step operations for both roles.

**Duplication question:** Does this duplicate an existing page? No. The plan repairs and links existing routes: `/messages/:showId`, `/secretary/messages?showId=...`, Message Center compose, Show Map actions, and existing My Shows/Show Details status cards. If implementation pressure pushes toward a new scratch inbox, refund page, or message composer, stop and narrow scope.

## Operational Boundaries

- Do not add DB tables, migrations, RLS changes, edge functions, or shared Supabase seed writes in Wave 2.
- Treat query params such as `showId` and `entryId` as navigation hints only. Validate them against already-authorized local context before using them.
- Use existing message/thread/composer surfaces. If a task appears to need a new inbox, scratch request form, refund page, or composer, stop and narrow the scope.
- Rollback is app-only: remove the links/context handling and the app returns to the previous behavior. No data rollback should be required.
- Browser re-walk steps may open compose surfaces and verify routes, but must not send messages or mutate shared staging data unless the user explicitly approves that shared-system write.

## Files

- Modify: `docs/audits/2026-06-ux-journeys/SUMMARY.md`
- Create: `docs/plan-wave2-cross-role-seam-recovery.md`
- Candidate modify, confirm before editing: `apps/myk9show/src/features/messages/pages/ChatPage.tsx`
- Candidate test, confirm before editing: `apps/myk9show/src/features/messages/pages/__tests__/ChatPage.test.tsx`
- Candidate modify, confirm before editing: `apps/myk9show/src/components/notifications/MessageCenterPanel.tsx`
- Candidate test, confirm before editing: `apps/myk9show/src/components/notifications/__tests__/MessageCenterPanel.test.tsx`
- Candidate modify, confirm before editing: `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx`
- Candidate test, confirm before editing: `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx`
- Candidate modify, confirm before editing: `apps/myk9show/src/pages/MyEntriesPage/modules/myEntriesUtils.tsx`
- Candidate test, confirm before editing: `apps/myk9show/src/pages/MyEntriesPage/modules/myEntriesUtils.test.ts`
- Candidate modify, confirm before editing: `apps/myk9show/src/utils/entryManagementUtils.ts`
- Candidate test, confirm before editing: `apps/myk9show/src/utils/entryManagementUtils.test.ts`
- Candidate modify, confirm before editing: `apps/myk9show/src/features/show-map/ShowMapRowActionsMenu.tsx`
- Candidate test, confirm before editing: `apps/myk9show/src/features/show-map/__tests__/ShowMapRowActionsMenu.test.tsx`
- Verify existing tests: `apps/myk9show/src/store/__tests__/messageStore.test.ts`
- Verify existing tests: `apps/myk9show/src/features/show-workbench/__tests__/MessageShowComposer.test.tsx`

## Task 1: Repair Exhibitor Message Route Empty State

**Purpose:** Make `/messages/:showId` useful even when no thread exists yet. The route should never render blank main content.

- [ ] **Step 1: Read the current route and tests**

Run:

```bash
rg -n "ChatPage|ThreadList|ThreadDetail|getOrCreateThread|No messages" \
  apps/myk9show/src/features/messages/pages/ChatPage.tsx \
  apps/myk9show/src/features/messages/pages/__tests__/ChatPage.test.tsx \
  apps/myk9show/src/store/messageStore.ts \
  apps/myk9show/src/features/messages/components
```

Expected: Identify how `ChatPage` picks a thread, what it renders when no thread exists, and whether an exhibitor start state is already partly present.

- [ ] **Step 2: Add the failing empty-state test**

In `apps/myk9show/src/features/messages/pages/__tests__/ChatPage.test.tsx`, add an equivalent test using the local test harness:

```typescript
it('shows an exhibitor start state instead of blank content when no thread exists', async () => {
  renderChatPage('/messages/show-1', {
    threads: [],
    messagesByThread: {},
    isLoading: false,
    error: null,
  });

  expect(await screen.findByRole('heading', { name: /Message the show team/i })).toBeInTheDocument();
  expect(screen.getByText(/Ask a question about this show/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Start message/i })).toBeEnabled();
});
```

If `renderChatPage` does not exist, create a small local helper in the test file that renders `ChatPage` in a `MemoryRouter` at `/messages/show-1` and mocks `useMessageStore`.

- [ ] **Step 3: Run the test red**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/features/messages/pages/__tests__/ChatPage.test.tsx -t "exhibitor start state"
```

Expected: FAIL because the blank route has no start-state heading.

- [ ] **Step 4: Implement the start state on the existing route**

Modify `apps/myk9show/src/features/messages/pages/ChatPage.tsx` so the no-thread branch renders a calm panel with one start action. Keep the action inside the existing message route and existing `messageStore.getOrCreateThread` flow.

Implementation shape:

```tsx
if (!selectedThread) {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <MessageSquare className="mb-4 h-10 w-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Message the show team</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask a question about this show and the secretary will see it in the existing Message Center.
      </p>
      <Button className="mt-6" onClick={handleStartMessage}>
        Start message
      </Button>
    </section>
  );
}
```

Use existing imports and local naming. If `ChatPage` already has a button component, reuse it.

- [ ] **Step 5: Add the failing start-error test**

Add a test that mocks `getOrCreateThread` returning `null` or rejecting, clicks `Start message`, and confirms the route stays nonblank:

```typescript
expect(await screen.findByText(/We couldn't start that message/i)).toBeInTheDocument();
expect(screen.getByRole('heading', { name: /Message the show team/i })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /Start message/i })).toBeEnabled();
```

Expected: FAIL until the route handles a thread-start failure.

- [ ] **Step 6: Implement start-error handling**

Wrap `handleStartMessage` in local pending/error state. If `getOrCreateThread` returns no thread or throws, keep the start panel visible, show a plain nonblocking error such as "We couldn't start that message. Try again.", and re-enable the button.

- [ ] **Step 7: Run the ChatPage tests green**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/features/messages/pages/__tests__/ChatPage.test.tsx
```

Expected: PASS.

## Task 2: Carry Show Context Into Message Center Compose

**Purpose:** Opening Message Center from a show-scoped context should preselect that show, so staff do not re-select known context.

- [ ] **Step 1: Read current compose state**

Run:

```bash
rg -n "composeShowId|handleOpenCompose|MessageCenterPanel|useSearchParams|currentShowIds|staffShows" \
  apps/myk9show/src/components/notifications/MessageCenterPanel.tsx \
  apps/myk9show/src/components/notifications/__tests__/MessageCenterPanel.test.tsx
```

Expected: `MessageCenterPanel` owns `composeShowId` and currently picks only the single-show fallback.

- [ ] **Step 2: Add the failing context test**

In `apps/myk9show/src/components/notifications/__tests__/MessageCenterPanel.test.tsx`, add:

```typescript
it('preselects the show from the current URL when opening compose', async () => {
  const user = userEvent.setup();

  renderMessageCenterPanel({
    route: '/secretary/messages?showId=show-1',
    shows: [
      { id: 'show-1', name: 'Heritage' },
      { id: 'show-2', name: 'Monogram' },
    ],
    currentShowIds: ['show-1', 'show-2'],
  });

  await user.click(screen.getByRole('button', { name: /Compose/i }));

  expect(screen.getByText('Heritage')).toBeInTheDocument();
  expect(screen.queryByText(/Select a show to continue/i)).not.toBeInTheDocument();
});
```

Adjust helper names to the local file. The important assertion is that `showId=show-1` wins over the two-show ambiguity.

- [ ] **Step 3: Run the test red**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/components/notifications/__tests__/MessageCenterPanel.test.tsx -t "preselects the show"
```

Expected: FAIL because the panel still asks for a show.

- [ ] **Step 4: Implement URL show context**

Modify `MessageCenterPanel`:

```typescript
import { useNavigate, useSearchParams } from 'react-router-dom';
```

Inside the component:

```typescript
const [searchParams] = useSearchParams();
const urlShowId = searchParams.get('showId') ?? '';
const validUrlShowId = staffShows.some(show => show.id === urlShowId) ? urlShowId : '';
```

Then update `handleOpenCompose`:

```typescript
function handleOpenCompose() {
  setComposeShowId(validUrlShowId || (staffShows.length === 1 ? staffShows[0].id : ''));
  setIsComposeOpen(true);
}
```

Security rule: `showId` from the URL is only a hint. Accept it only when it exists in the already-authorized `staffShows` list or equivalent current-show context already loaded for the staff user.

- [ ] **Step 5: Add the invalid-show test**

Add a test for `/secretary/messages?showId=unknown` with two authorized staff shows. Opening compose should still ask the user to select a show and must not display or store `unknown`.

Expected: FAIL until invalid query params are ignored.

- [ ] **Step 6: Run MessageCenterPanel tests green**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/components/notifications/__tests__/MessageCenterPanel.test.tsx
```

Expected: PASS.

## Task 3: Add Post-Deadline Exhibitor Recovery Link

**Purpose:** Replace the post-deadline `Edit Entry` dead end with a link into the existing message route.

- [ ] **Step 1: Locate the deadline block**

Run:

```bash
rg -n "Entry deadline has passed|entry deadline|deadline" \
  apps/myk9show/src/pages/MyEntriesPage \
  apps/myk9show/src/pages/ShowDetailsPage.tsx \
  apps/myk9show/src/components/shows
```

Expected: Find the dialog or card branch that shows the read-only deadline message.

- [ ] **Step 2: Add the failing card/dialog test**

Before writing the fixture, inspect the actual `MyEntry` type and the located deadline block. Do not add fake props such as `canEdit` unless the real type supports them. If the deadline block lives in another dialog/component, put this assertion in that component's test instead.

In the closest existing test file, likely `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx`, add an equivalent assertion using real fields that derive the post-deadline blocked state:

```typescript
it('links post-deadline blocked edits to the existing message route', () => {
  render(
    <MyEntryCard
      entry={{
        ...baseEntry,
        showId: 'show-1',
        entryCloseDate: new Date('2026-01-01T00:00:00Z'),
      }}
      onCheckInClick={vi.fn()}
      onEditClick={vi.fn()}
      onReceiptClick={vi.fn()}
    />
  );

  expect(screen.getByRole('link', { name: /Message the show team/i })).toHaveAttribute(
    'href',
    '/messages/show-1'
  );
});
```

If the deadline block lives in another component, move this exact assertion to that component's test.

- [ ] **Step 3: Run the test red**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx -t "post-deadline"
```

Expected: FAIL because the link is not rendered.

- [ ] **Step 4: Implement the link**

Add a secondary action near the deadline block:

```tsx
<Button asChild variant="outline" size="sm">
  <Link to={`/messages/${entry.showId}`}>Message the show team</Link>
</Button>
```

Do not add a scratch request form in this wave. The message route is the existing seam.

- [ ] **Step 5: Run the focused test green**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx
```

Expected: PASS.

## Task 4: Normalize Withdrawn And Refunded Exhibitor State

**Purpose:** Make exhibitor My Shows/Show Details agree with secretary surfaces for terminal withdrawn/refunded entries.

- [ ] **Step 1: Read mapping helpers and tests**

Run:

```bash
rg -n "mapEntryStatus|mapPaymentStatus|getContextualStatusMessage|getPaymentStatusBadge|withdrawn|refunded|partial" \
  apps/myk9show/src/utils/entryManagementUtils.ts \
  apps/myk9show/src/utils/entryManagementUtils.test.ts \
  apps/myk9show/src/pages/MyEntriesPage/modules/myEntriesUtils.tsx \
  apps/myk9show/src/pages/MyEntriesPage/modules/myEntriesUtils.test.ts \
  apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesData.ts
```

Expected: Identify whether the mismatch comes from status mapping, contextual copy, date-based copy, or data selection.

- [ ] **Step 2: Add value-sensitive tests**

In `apps/myk9show/src/pages/MyEntriesPage/modules/myEntriesUtils.test.ts`, add:

```typescript
it('describes withdrawn refunded entries as terminal, not upcoming', () => {
  const message = getContextualStatusMessage(
    {
      ...baseEntry,
      entryStatus: EntryStatus.CANCELLED,
      paymentStatus: PaymentStatus.REFUNDED,
      showDate: new Date('2026-07-01T00:00:00Z'),
    },
    formatDistanceToNow,
    format,
    isToday,
    isTomorrow,
    differenceInDays
  );

  expect(message.message).toMatch(/Withdrawn/i);
  expect(message.message).toMatch(/refunded/i);
  expect(message.message).not.toMatch(/Upcoming/i);
});
```

Also add or confirm:

```typescript
expect(mapEntryStatus('withdrawn')).toBe(EntryStatus.CANCELLED);
expect(mapPaymentStatus('refunded')).toBe(PaymentStatus.REFUNDED);
```

Add rendered badge coverage for full versus partial refund language in both touched helper surfaces. The shared utility helper already distinguishes `PaymentStatus.REFUNDED` and `PaymentStatus.PARTIAL_REFUND`; the My Entries helper must either intentionally match that distinction or have a test proving the chosen exhibitor-facing wording:

```typescript
render(getPaymentStatusBadge(PaymentStatus.REFUNDED));
expect(screen.getByText(/^Refunded$/i)).toBeInTheDocument();

render(getPaymentStatusBadge(PaymentStatus.PARTIAL_REFUND));
expect(screen.getByText(/Partial refund|Refunded/i)).toBeInTheDocument();
```

If the implementation has access to refund amounts, add the equivalent assertion that a fully refunded entry is not labeled "Partial refund."

- [ ] **Step 3: Run the tests red**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run \
  src/pages/MyEntriesPage/modules/myEntriesUtils.test.ts \
  src/utils/entryManagementUtils.test.ts \
  -t "withdrawn|refunded"
```

Expected: At least the contextual message test FAILS if the card still says Upcoming.

- [ ] **Step 4: Implement terminal-state precedence**

In `getContextualStatusMessage`, check terminal states before date/upcoming copy, including both full and partial refunds:

```typescript
if (entry.entryStatus === EntryStatus.CANCELLED || entry.entryStatus === EntryStatus.SCRATCHED) {
  if (entry.paymentStatus === PaymentStatus.REFUNDED) {
    return {
      message: 'Withdrawn - refunded',
      className: 'text-muted-foreground',
    };
  }

  if (entry.paymentStatus === PaymentStatus.PARTIAL_REFUND) {
    return {
      message: 'Withdrawn - partial refund issued',
      className: 'text-muted-foreground',
    };
  }

  return {
    message: entry.entryStatus === EntryStatus.SCRATCHED ? 'Scratched' : 'Withdrawn',
    className: 'text-muted-foreground',
  };
}
```

Preserve existing `// INTENT:` comments if present.

- [ ] **Step 5: Run terminal-state tests green**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run \
  src/pages/MyEntriesPage/modules/myEntriesUtils.test.ts \
  src/utils/entryManagementUtils.test.ts
```

Expected: PASS.

## Task 5: Add Secretary Row-Level Message Fallback

**Purpose:** Let secretary row actions contact an exhibitor from the existing Show Map/entry row context without adding a new composer.

- [ ] **Step 1: Read existing Show Map message action code**

Run:

```bash
rg -n "ShowMapRowActionsMenu|ShowMapMessageHandlerDialog|showMapMessageTemplates|Message" \
  apps/myk9show/src/features/show-map \
  apps/myk9show/src/features/show-map/__tests__
```

Expected: Existing message dialog/template code is present. Reuse it instead of creating another row composer.

- [ ] **Step 2: Add the failing row action test**

In `apps/myk9show/src/features/show-map/__tests__/ShowMapRowActionsMenu.test.tsx`, add:

```typescript
it('shows a message action for entry rows with exhibitor contact context', async () => {
  const user = userEvent.setup();
  const onMessageEntry = vi.fn();

  render(
    <ShowMapRowActionsMenu
      row={entryRowWithExhibitor}
      showId="show-1"
      onMessageEntry={onMessageEntry}
    />
  );

  await user.click(screen.getByRole('button', { name: /Actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /Message exhibitor/i }));

  expect(onMessageEntry).toHaveBeenCalledWith(
    expect.objectContaining({ entryId: entryRowWithExhibitor.id, showId: 'show-1' })
  );
});
```

Adjust props to match the component. The invariant is a row-level `Message exhibitor` action that passes existing row context.

- [ ] **Step 3: Run the test red**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run src/features/show-map/__tests__/ShowMapRowActionsMenu.test.tsx -t "message action"
```

Expected: FAIL if the menu lacks the message action.

- [ ] **Step 4: Implement by reusing existing message dialog/template**

Prefer the existing `ShowMapMessageHandlerDialog` if it already sends targeted entry/exhibitor messages. If it does not, wire the menu item to the existing Message Center route and update the route handler to validate and consume both `showId` and `entryId`. Do not pass an `entryId` query param that the destination ignores.

Candidate menu shape:

```tsx
<DropdownMenuItem onClick={() => onMessageEntry?.({ showId, entryId: row.id })}>
  <MessageSquare className="mr-2 h-4 w-4" />
  Message exhibitor
</DropdownMenuItem>
```

If routing is used, build `/secretary/messages?showId=${showId}&entryId=${row.id}` only after adding Message Center coverage that the `entryId` belongs to the validated `showId` and pre-fills the existing recipient/template context. Invalid `entryId` must be ignored.

- [ ] **Step 5: Run Show Map action tests green**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run \
  src/features/show-map/__tests__/ShowMapRowActionsMenu.test.tsx \
  src/features/show-map/__tests__/ShowMapMessageHandlerDialog.test.tsx
```

Expected: PASS.

## Task 6: Record Wave 2 Remediation Status

**Purpose:** Keep the UX summary honest while Wave 2 is in progress.

- [ ] **Step 1: Update the Wave 1 note**

In `docs/audits/2026-06-ux-journeys/SUMMARY.md`, replace the Wave 1 note with:

```markdown
**Wave 1 implementation note:** Shipped in PRs #732, #733, and #734. Do not rescore Exhibitor to Yellow or Green until the post-remediation golden-path re-walk records class selection, payment handoff, confirmation, and payment recovery evidence in this summary.
```

- [ ] **Step 2: Add the Wave 2 planning note**

Under the Wave 1 note, add:

```markdown
**Wave 2 implementation note:** Approved for planning 2026-06-14. Plan: [`docs/plan-wave2-cross-role-seam-recovery.md`](../../plan-wave2-cross-role-seam-recovery.md). Scope is existing message, status, and Show Map surfaces only; fixture-backed mutation proof remains Wave 5 unless shared Supabase seed mutations are explicitly approved.
```

- [ ] **Step 3: Check human gate**

Change:

```markdown
- [ ] Wave 2 is approved once entry/payment trust is unblocked.
```

to:

```markdown
- [x] Wave 2 is approved once entry/payment trust is unblocked.
```

- [ ] **Step 4: Check markdown whitespace**

Run:

```bash
git diff --check docs/audits/2026-06-ux-journeys/SUMMARY.md docs/plan-wave2-cross-role-seam-recovery.md
```

Expected: no output.

## Task 7: Focused Verification

**Purpose:** Prove Wave 2 behavior before any browser re-walk.

- [ ] **Step 1: Run focused unit and component tests**

Run:

```bash
cd apps/myk9show && pnpm exec vitest run \
  src/features/messages/pages/__tests__/ChatPage.test.tsx \
  src/components/notifications/__tests__/MessageCenterPanel.test.tsx \
  src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx \
  src/pages/MyEntriesPage/modules/myEntriesUtils.test.ts \
  src/utils/entryManagementUtils.test.ts \
  src/features/show-map/__tests__/ShowMapRowActionsMenu.test.tsx \
  src/features/show-map/__tests__/ShowMapMessageHandlerDialog.test.tsx
```

Expected: PASS. If the runner hangs for more than 60 seconds without useful output, stop it and report the hang.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm --filter @myk9/show typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm --filter @myk9/show lint
```

Expected: PASS except known pre-existing warnings, which must be named in the PR body.

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

## Task 8: Browser Seam Re-Walk

**Purpose:** Re-check the actual cross-role surfaces after code-level verification.

- [ ] **Step 1: Start the app**

Run:

```bash
pnpm dev:show
```

Expected: local myK9Show starts on `http://localhost:5173` unless that port is occupied.

- [ ] **Step 2: Exhibitor message empty-state check**

Use browser automation:

```text
1. Sign in as exhibitor1@myk9t.com.
2. Open /messages/<showId> for a show with no existing thread.
3. Confirm the page shows "Message the show team" and "Start message".
```

Expected: no blank main content.

- [ ] **Step 3: Secretary compose context check**

Use browser automation:

```text
1. Sign in as secretary@myk9t.com.
2. Open /secretary/messages?showId=<showId>.
3. Open Message Center compose.
4. Confirm the show is preselected.
```

Expected: no "Select a show to continue" for a valid `showId`.

- [ ] **Step 4: Post-deadline recovery check**

Use browser automation:

```text
1. Sign in as exhibitor1@myk9t.com.
2. Open the entry that previously showed "Entry deadline has passed".
3. Confirm the block offers a message/contact path to /messages/<showId>.
```

Expected: no dead-end block.

- [ ] **Step 5: Terminal state agreement check**

Use browser automation:

```text
1. Compare the known withdrawn/refunded entry in secretary and exhibitor contexts.
2. Confirm exhibitor surfaces no longer label it Upcoming.
3. Confirm withdrawn/refunded language is visible to the exhibitor.
```

Expected: secretary and exhibitor states agree at the user-facing level.

- [ ] **Step 6: Show Map row message fallback check**

Use browser automation:

```text
1. Sign in as secretary@myk9t.com.
2. Open Show Map for the observed show.
3. Open an entry row action menu.
4. Confirm a Message exhibitor action appears and routes/opens existing message context.
```

Expected: action exists without a new duplicate composer surface.

Do not click the final send action or create shared messages during this re-walk unless the user explicitly approves that shared-system mutation.

## Task 9: Commit

**Purpose:** Keep the remediation easy to review.

- [ ] **Step 1: Review the diff**

Run:

```bash
git diff --stat
git diff -- docs/plan-wave2-cross-role-seam-recovery.md docs/audits/2026-06-ux-journeys/SUMMARY.md
```

Expected: plan/docs changes are clear. If implementation tasks have run, app diffs match only the files listed in this plan.

- [ ] **Step 2: Stage only Wave 2 files**

For the plan-only commit:

```bash
git add docs/plan-wave2-cross-role-seam-recovery.md docs/audits/2026-06-ux-journeys/SUMMARY.md
```

For implementation commits, add only the task-specific files named above.

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "docs: plan wave 2 cross-role seam recovery"
```

Expected: commit succeeds from the worktree branch.
