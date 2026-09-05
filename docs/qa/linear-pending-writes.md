# Linear pending writes

Findings that could not be filed because Linear was unreachable. **Reconcile and
delete each entry once it is in Linear** — this file exists so a finding is never
lost to an outage, not as a second tracker.

Rule of record: `docs/agents/issue-tracker.md`. Dedupe with `includeArchived: true`
before filing, since Done issues auto-archive.

---

## 2026-09-05 — Editing a show ends on a "Show Created!" overlay that denies its existing access codes

**Status:** unfiled. **Uncertain whether a duplicate exists** — see "Filing note" below.
Source: branch-hygiene sweep, 2026-09-05. Confirmed in the browser on deployed
staging at `main` = `15377b1e3`. Canonical **P2**. Labels to apply: `Claude`, `Bug`.
Priority: High (2).

### Reproduction

Signed in as `testadmin@myk9t.com`, on the existing **published** show
`ZZ Audit - Rewalk` (`75e078e9-81c3-46f0-aedd-94acfe15d353`) — 1 trial, 2 classes,
2 live entries, **4 rows in `show_passcodes`**.

1. Open `/secretary/create-show/wizard?showId=75e078e9-…&mode=add-classes`. The wizard
   opens at step 3 with steps 1–2 marked Done — correct edit-mode entry.
2. Click **Next** to reach Review. The submit button is correctly labelled **"Add Classes"**.
3. Click **"Add Classes"** (no new classes selected, so this writes nothing).

Rendered:

```
Show Created!

ZZ Audit - Rewalk

Show Access Codes
No access codes are available for this show yet.
[ Generate new codes ]

[ Review & Publish Show ]
```

Four false or inappropriate statements on one screen, for a show that already existed:

| Rendered | Reality |
| --- | --- |
| **"Show Created!"** | The show already existed; this was an edit |
| **"No access codes are available for this show yet"** | `show_passcodes` holds **4** rows for this show |
| **"Generate new codes"** | This is `regenerate_show_passcodes` — `ShowAccessCodesCard.tsx:53-60` calls it *"the destructive regeneration UI"* |
| **"Review & Publish Show"** | `shows.status` is already `published` |

Database confirmed unchanged after the probe (1 trial, 2 classes with the same names,
still `published`, 2 entries, 4 passcodes) — a confirmation-UI defect, not data corruption.

### Why it matters

A secretary adding classes to a **live show that already has entries** is told their
access codes do not exist and is offered a button to generate them. The regeneration is
confirm-gated and RBAC-checked server-side, so this is not one click from disaster — but
the framing invites it, and rotating passcodes on a running show invalidates the codes
exhibitors and stewards are already using. `ShowAccessCodesCard`'s `canRegenerate` prop
exists precisely to keep that CTA off surfaces where it does not belong; the completion
overlay is such a surface.

### Root cause

The save path is edit-blind, while the button *label* above it is not.

```
ReviewStepActions button
  → handleCreateShowGuarded        ReviewStep.tsx:91      validation errors only
  → handleCreateShow               useShowCreationWizardActions.ts:468
  → createDraftShow(saveShow)      showSaveCompletion.ts:23
  → saveShow('draft', true)        ← shouldShowCompletion hard-coded TRUE
  → finishShowSave(...)            showSaveCompletion.ts:39
       if (shouldShowCompletion && onCreated) → onCreated(...)
  → WizardSuccessOverlay           "Show Created!" + ShowAccessCodesCard
```

- `createDraftShow` is the **only** caller that sets `shouldShowCompletion`, always `true`.
- `onCreated` is wired **unconditionally** at `ShowCreationWizardPage.tsx:103`.
- `ReviewStep` has **zero** edit-mode awareness (grep `editMode|isEditMode|Update|Save Changes`: no hits).
- The passcodes shown are whatever `onCreated` was handed, which for an edit is `null` —
  hence "no access codes yet" despite 4 existing.

The sharp part: `WizardStepContent.tsx:84` passes `submitLabel={getSubmitLabel(editMode?.mode)}`
(`wizardLabels.ts:30` → `'Add Trials'` / `'Add Classes'` / `'Create Show'`). **The component
rendering the button knows it is in edit mode and labels it correctly; the handler behind
that same button discards the knowledge.**

The show itself is updated correctly — `useShowCreationWizardActions.ts:283` takes the
`editMode?.showId` update path. Only the completion UI is wrong.

### A fix already exists, unmerged

`codex/fix-edit-completion-overlay` (`bcca8a082`, 2026-08-30) adds exactly this guard — an
`isEditMode` branch in `finishShowSave` that navigates to `/shows/:showId`, an "updated
successfully" toast for edit saves, and a `createDraftShow.test.ts` case. It has **no PR and
no Linear issue** and was never merged; the branch is still on the remote. Review it rather
than rewriting, but check its approach against the `submitLabel` plumbing that already
carries `editMode`.

### Nothing pins the current behaviour

No test asserts the overlay in edit mode — `createDraftShow.test.ts` and
`ShowCreationWizardPage.success.test.tsx` both exercise the creation path. The only nearby
`INTENT` comment (`WizardSuccessOverlay.tsx:16`) is about not re-adding confetti.

### Acceptance criteria

- [ ] Saving in `add-trials` / `add-classes` mode does not render the creation-completion
      overlay; it returns to the show with a confirmation naming what changed.
- [ ] The destructive "Generate new codes" CTA is never offered on the path following an edit save.
- [ ] No surface tells a secretary a show has no access codes when `show_passcodes` has rows for it.
- [ ] A test renders the Review submit in edit mode and asserts the offered post-save
      destination — reverting the guard must fail it. Asserting only on the creation path
      proves nothing here.
- [ ] Creation still shows the overlay with its passcodes (do not regress MYK9-68).

### Required proof for closure

Browser replay on a published show with existing passcodes: enter `?showId=…&mode=add-classes`,
save from Review, and confirm you land on the show with no "Show Created!" and no
regeneration CTA.

### Files

- `apps/myk9show/src/pages/secretary/ShowCreationWizard/showSaveCompletion.ts:23-48`
- `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts:468`
- `apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx:103`
- `apps/myk9show/src/components/shows/wizard/steps/ReviewStep.tsx:91`
- `apps/myk9show/src/pages/secretary/ShowCreationWizard/WizardStepContent.tsx:84`, `wizardLabels.ts:30`
- `apps/myk9show/src/components/secretary/ShowAccessCodesCard.tsx:53-60`

### Related

MYK9-68 (preserve the passcode card after generation), MYK9-257 (edit-mode gate),
MYK9-286 (`/shows/new`).

### Filing note — read before re-filing

A `save_issue` call carrying this exact body was attempted at ~13:4x UTC on 2026-09-05 and
**timed out**. Every subsequent Linear read also timed out, so I could not determine whether
the issue was created before the timeout or not at all. **Search Linear for
"Show Created" / "access codes" / the wizard files above (with `includeArchived: true`)
before filing, and delete this entry once reconciled.**
