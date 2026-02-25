# Dog Edit Consolidation & CRUD Testing Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate two redundant dog edit components into one, delete dead code, and verify full dog CRUD end-to-end via Claude Preview.

**Architecture:** Replace `DogProfileEditDialog` (263 lines, modal dialog) with `DogEditPanel` (697 lines, slide-out panel) everywhere. Add missing `spayedNeutered` field to DogEditPanel. Delete dead `DogDetailsView.tsx`. Test all CRUD operations via preview.

**Tech Stack:** React, TypeScript, shadcn/ui, Zustand, React Query, Supabase

---

## Task 1: Add `spayedNeutered` to DogEditPanel

**Files:**
- Modify: `apps/myk9show/src/components/panels/edit/DogEditPanel.tsx`

### Step 1: Add `spayedNeutered` to `DogFormData` interface

In `DogEditPanel.tsx`, add the field to the `DogFormData` interface (after `specialNeeds`):

```typescript
// In DogFormData interface (~line 57)
  specialNeeds?: string;
  spayedNeutered?: boolean;  // ADD THIS
}
```

### Step 2: Wire `spayedNeutered` into `dogToFormData()`

In the `dogToFormData` function (~line 98), add the mapping:

```typescript
// Add after specialNeeds line (~line 120):
    specialNeeds: (dog as Record<string, unknown>).specialNeeds as string || '',
    spayedNeutered: dog.spayedNeutered ?? false,  // ADD THIS
  };
```

### Step 3: Wire `spayedNeutered` into `formDataToDog()`

In the `formDataToDog` function (~line 125), add to the return object:

```typescript
// Add after the specialNeeds spread (~line 170):
    ...(formData.specialNeeds && ({ specialNeeds: formData.specialNeeds } as Record<string, unknown>)),
    spayedNeutered: formData.spayedNeutered,  // ADD THIS
  };
```

### Step 4: Add the checkbox UI in Basic Info tab

In `DogEditForm` component, after the Microchip Number field (~line 476) and before the Owner Selection field (~line 478), add a spayed/neutered checkbox:

```tsx
              {/* After microchip field div, before OwnerSelectionField */}
              <div className="flex items-center space-x-3 pt-2">
                <input
                  type="checkbox"
                  id="spayedNeutered"
                  checked={data.spayedNeutered ?? false}
                  onChange={(e) => updateData({ spayedNeutered: e.target.checked })}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <Label htmlFor="spayedNeutered" className="text-sm font-medium cursor-pointer">
                  Spayed/Neutered
                </Label>
              </div>
```

### Step 5: Run typecheck

Run: `pnpm typecheck`
Expected: 0 errors

### Step 6: Commit

```bash
git add apps/myk9show/src/components/panels/edit/DogEditPanel.tsx
git commit -m "feat(dogs): add spayedNeutered field to DogEditPanel"
```

---

## Task 1B: Wire `spayedNeutered` through data pipeline [ADDED]

**Files:**
- Modify: `apps/myk9show/src/store/dogStore.ts` (DogInput interface)
- Modify: `apps/myk9show/src/types/dog-types.ts` (DogInput interface)
- Modify: `apps/myk9show/src/services/mappers/dogMappers.ts` (insert, update, read, round-trip mappers)
- Modify: `apps/myk9show/src/components/dogs/DogDetailsMain/utils.ts` (convertDogToDogInput)

The `spayedNeutered` field exists in the DB (`spayed_neutered BOOLEAN`) and on the `Dog` domain type, but is missing from `DogInput` and all mappers. Without this, the field won't persist through save.

### Step 1: Add `spayedNeutered` to both `DogInput` interfaces

In `apps/myk9show/src/store/dogStore.ts` (~line 24, after `imageUrl`):
```typescript
  imageUrl?: string | undefined;
  spayedNeutered?: boolean | undefined;  // ADD THIS
  registrations?: Array<{
```

In `apps/myk9show/src/types/dog-types.ts` (~line 210, after `imageUrl`):
```typescript
  imageUrl?: string | undefined;
  spayedNeutered?: boolean | undefined;  // ADD THIS
  registrations?: Array<{
```

### Step 2: Add to `mapDogInputToInsert` in dogMappers.ts

After `call_name` line (~line 85):
```typescript
    call_name: input.callName || null,
    spayed_neutered: input.spayedNeutered ?? null,  // ADD THIS
```

### Step 3: Add to `mapDogInputToUpdate` in dogMappers.ts

After `image_url` line (~line 114):
```typescript
  if (input.imageUrl !== undefined) update.image_url = input.imageUrl || null;
  if (input.spayedNeutered !== undefined) update.spayed_neutered = input.spayedNeutered;  // ADD THIS
```

### Step 4: Add to `mapDatabaseToDog` in dogMappers.ts

In the return object (~line 142, after `imageUrl`):
```typescript
    imageUrl: (dbDog.image_url as string) || undefined,
    spayedNeutered: (dbDog.spayed_neutered as boolean) ?? undefined,  // ADD THIS
```

### Step 5: Add to `mapDogToDogInput` in dogMappers.ts

After `imageUrl` line (~line 184):
```typescript
    imageUrl: dog.imageUrl,
    spayedNeutered: dog.spayedNeutered,  // ADD THIS
```

### Step 6: Add to `convertDogToDogInput` in utils.ts

After `healthRecords` line (~line 76):
```typescript
  if (dogData.healthRecords !== undefined) result.healthRecords = dogData.healthRecords;
  if (dogData.spayedNeutered !== undefined) result.spayedNeutered = dogData.spayedNeutered;  // ADD THIS
```

### Step 7: Run typecheck

Run: `pnpm typecheck`
Expected: 0 errors

### Step 8: Commit

```bash
git add apps/myk9show/src/store/dogStore.ts apps/myk9show/src/types/dog-types.ts apps/myk9show/src/services/mappers/dogMappers.ts apps/myk9show/src/components/dogs/DogDetailsMain/utils.ts
git commit -m "feat(dogs): wire spayedNeutered through full data pipeline"
```

---

## Task 2: Replace DogProfileEditDialog in UserDetailsTabs

**Files:**
- Modify: `apps/myk9show/src/components/users/UserDetails/UserDetailsTabs.tsx`

### Step 1: Replace import and refactor component

Replace the `DogProfileEditDialog` import and usage with `DogEditPanel`. The key differences:
- `DogProfileEditDialog` takes `dog: Dog` and `onSave: (dog: Dog) => void`
- `DogEditPanel` takes `dogId`, `dogName`, `initialDogData`, `onSave: (data: Partial<DogType>) => Promise<void>`

Full replacement for `UserDetailsTabs.tsx`:

1. **Replace import** (line 7):
```typescript
// REMOVE:
import { DogProfileEditDialog } from '@/components/dogs/common/DogProfileEditDialog';
// ADD:
import { DogEditPanel } from '@/components/panels/edit/DogEditPanel';
```

2. **Add Dog type import** — ensure `Dog` is still imported from `@/types/dog-types` (it already is on line 8).

3. **Replace `handleSaveDogEdit`** (lines 66-99). The current function receives a full `Dog` object. DogEditPanel passes `Partial<DogType>`. Rewrite:

```typescript
  // Handler for saving dog edits from DogEditPanel
  const handleSaveDogEdit = async (updatedDogData: Partial<Dog>) => {
    if (!dogToEdit) return;

    const isNewDog = !dogToEdit.id;

    if (isNewDog) {
      const tempId = `temp-${Date.now()}`;
      const mergedDog = { ...dogToEdit, ...updatedDogData, id: tempId, ownerId: selectedUser.id };

      const { addDog } = useDogStore.getState();
      addDog(dogToDogInput(mergedDog as Dog));

      const currentDogs = selectedUser.dogs || [];
      updateUser(selectedUser.id, { dogs: [...currentDogs, tempId] });
    } else {
      const { updateDog } = useDogStore.getState();
      updateDog(dogToEdit.id, dogToDogInput({ ...dogToEdit, ...updatedDogData } as Dog));
    }

    setIsEditDialogOpen(false);
    setDogToEdit(null);
  };
```

4. **Replace JSX** (lines 224-233). Replace the `DogProfileEditDialog` with `DogEditPanel`:

```tsx
      <DogEditPanel
        open={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setDogToEdit(null);
        }}
        dogId={dogToEdit?.id || ''}
        dogName={dogToEdit?.callName || dogToEdit?.name || 'New Dog'}
        initialDogData={dogToEdit || {}}
        onSave={handleSaveDogEdit}
        enableAutoSave={false}
      />
```

### Step 2: Run typecheck

Run: `pnpm typecheck`
Expected: 0 errors

### Step 3: Commit

```bash
git add apps/myk9show/src/components/users/UserDetails/UserDetailsTabs.tsx
git commit -m "refactor(dogs): replace DogProfileEditDialog with DogEditPanel in UserDetailsTabs"
```

---

## Task 3: Delete dead code

**Files:**
- Delete: `apps/myk9show/src/components/dogs/common/DogProfileEditDialog.tsx`
- Delete: `apps/myk9show/src/components/dogs/DogDetails/DogDetailsView.tsx`

### Step 1: Verify no remaining imports

Run searches to confirm no other files import these components:

```bash
grep -r "DogProfileEditDialog" apps/myk9show/src/ --include="*.ts" --include="*.tsx" | grep -v "DogProfileEditDialog.tsx"
grep -r "DogDetailsView" apps/myk9show/src/ --include="*.ts" --include="*.tsx" | grep -v "DogDetailsView.tsx"
```

Expected: zero results for both (UserDetailsTabs was the last consumer of DogProfileEditDialog; DogDetailsView had zero importers).

### Step 2: Delete the files

```bash
rm apps/myk9show/src/components/dogs/common/DogProfileEditDialog.tsx
rm apps/myk9show/src/components/dogs/DogDetails/DogDetailsView.tsx
```

### Step 3: Run typecheck + lint

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors

### Step 4: Commit

```bash
git add -A
git commit -m "refactor(dogs): delete redundant DogProfileEditDialog and dead DogDetailsView"
```

---

## Task 4: Test Dog CRUD via Claude Preview

Start the dev server and test through the UI.

### Step 1: Start dev server

Run: `pnpm dev:show`
Navigate to: `http://localhost:5173`

### Step 2: Test CREATE — Happy path

1. Navigate to `/dogs`
2. Click "Add Dog" button in sidebar
3. Fill Tab 1 (Basic Info):
   - Call Name: "TestDog Max"
   - Gender: Male
   - Date of Birth: 2022-06-15
   - Owner: pick any existing person
4. Fill Tab 2 (Registration):
   - Add registration: AKC, number "DN12345678", breed "German Shepherd"
5. Fill Tab 3 (Additional):
   - Color: "Black and Tan"
   - Weight: 75
   - Height: 24
   - Microchip: "985141000123456"
   - Spayed/Neutered: check
6. Click "Create Dog"
7. **Verify:** Redirects to new dog detail page with all fields displayed correctly

### Step 3: Test CREATE — Validation edge cases

1. Open "Add Dog" panel again
2. Try saving with empty required fields → expect validation errors
3. Try a future date of birth → expect "cannot be in the future" error
4. Try a date >30 years ago → expect "too far in the past" error

### Step 4: Test EDIT — DogEditPanel from dog details page

1. On the dog detail page for "TestDog Max", click Edit
2. Change call name to "TestDog Maximus"
3. Change weight to 80
4. Verify spayed/neutered checkbox reflects the value set during creation
5. Save changes
6. **Verify:** Detail page updates with new values
7. **Verify:** No console errors

### Step 5: Test EDIT — DogEditPanel from User Profile (formerly DogProfileEditDialog)

1. Navigate to the owner's user profile page
2. Find the "Dogs" tab with associated dogs
3. Click edit on "TestDog Maximus"
4. **Verify:** DogEditPanel opens (not the old dialog)
5. Change color to "Sable"
6. Save changes
7. **Verify:** Changes persist

### Step 5B: Test ADD NEW DOG from User Profile [ADDED]

1. Navigate to the owner's user profile page
2. Click "Add New Dog" button on the Dogs tab
3. **Verify:** DogEditPanel opens with blank fields (this is a hacky flow — creation via edit panel with empty dog)
4. Fill in required fields: call name, gender, DOB
5. Save
6. **Verify:** New dog appears in the associated dogs list
7. **Note:** If this flow is buggy, consider replacing with proper `AddDogPanel` (document as tech debt)

### Step 6: Test DELETE

1. Navigate back to `/dogs/` and select "TestDog Maximus"
2. Open the delete dialog (via ... menu or delete button)
3. **Verify:** Confirmation shows "TestDog Maximus" in the text
4. Confirm deletion
5. **Verify:** Dog removed from sidebar, redirects to another dog or empty state

### Step 7: UI polish audit

Check throughout all operations:
- [ ] No console errors or warnings
- [ ] No validation errors shown on panel open (bug found in club CRUD)
- [ ] No overflow clipping on dropdowns
- [ ] No empty `src` on avatar images
- [ ] Panel/dialog animations are smooth
- [ ] Tab navigation works correctly in DogEditPanel

### Step 8: Fix any bugs found

Fix bugs inline as discovered. Document each fix.

### Step 9: Final commit

Commit any bug fixes with descriptive messages.

---

## Task 5: Update TO-DOS.md

**Files:**
- Modify: `TO-DOS.md`

### Step 1: Mark the dog CRUD todo as complete

Add `[x]` prefix and completion notes to the dog CRUD todo item, following the pattern used for the club CRUD entry. Include:
- Summary of what was tested
- List of bugs found and fixed (if any)
- Note about the consolidation work done

### Step 2: Commit

```bash
git add TO-DOS.md
git commit -m "docs: mark dog CRUD testing complete"
```
