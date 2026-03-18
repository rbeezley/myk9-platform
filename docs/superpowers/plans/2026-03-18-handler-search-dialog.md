# Handler Search Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-text handler input with a combobox that searches the people table, falling back to free text, and fix the `hasHandler` display bug across 4 files.

**Architecture:** The `HandlerSelectionDialog` gets an inline combobox (search input + dropdown) per dog, powered by `useUserStore().people` and `filterPeopleByName()`. A new `selectedPersonIds` state tracks which person record was picked. Bug fixes change `hasHandler` checks from `handlerId` to `handlerName` in 3 other files.

**Tech Stack:** React, TypeScript, Zustand (`useUserStore`), Vitest, `@testing-library/react`

**Spec:** `docs/superpowers/specs/2026-03-18-handler-search-dialog-design.md`

---

## File Map

| File                                                                                 | Action | Responsibility                                                       |
| ------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------- |
| `apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerSelectionDialog.tsx` | Modify | Replace Input with combobox, add people search, rewrite handleSubmit |
| `apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerAssignmentStep.tsx`  | Modify | Fix `hasHandler` check (line 55)                                     |
| `apps/myk9show/src/components/shows/RegistrationWorkflow/InlineHandlerSection.tsx`   | Modify | Fix `hasHandler` check (line 52)                                     |
| `apps/myk9show/src/pages/RegistrationWizardPage.tsx`                                 | Modify | Fix `canProceed` validation (lines 291, 298)                         |
| `apps/myk9show/src/test/components/HandlerSelectionDialog.test.tsx`                  | Create | Unit tests for combobox behavior                                     |
| `apps/myk9show/src/test/components/HandlerAssignment.bugfix.test.tsx`                | Create | Unit tests for hasHandler + canProceed bug fixes                     |

---

## Task 1: Fix `hasHandler` display bug (3 files)

**Files:**

- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerAssignmentStep.tsx:55`
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/InlineHandlerSection.tsx:52`
- Modify: `apps/myk9show/src/pages/RegistrationWizardPage.tsx:291,298`
- Create: `apps/myk9show/src/test/components/HandlerAssignment.bugfix.test.tsx`

- [ ] **Step 1: Write failing tests for the bug**

Create `apps/myk9show/src/test/components/HandlerAssignment.bugfix.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * These tests verify that handler assignment checks use handlerName (not handlerId)
 * so that free-text handlers (no person record) display correctly.
 *
 * Bug: when a dog has no owner, handlerId is '' and !!'' === false,
 * causing "Not assigned" to display even after a handler name is entered.
 */

describe('Handler Assignment Bug Fixes', () => {
  describe('HandlerAssignmentStep', () => {
    it('should check handlerName not handlerId for hasHandler', () => {
      const filePath = path.join(
        __dirname,
        '../../components/shows/RegistrationWorkflow/HandlerAssignmentStep.tsx'
      );
      const content = fs.readFileSync(filePath, 'utf8');
      // Must use handlerName for presence check
      expect(content).toContain('hasHandler: !!handler?.handlerName');
      // Must NOT use handlerId for presence check
      expect(content).not.toContain('hasHandler: !!handler?.handlerId');
    });
  });

  describe('InlineHandlerSection', () => {
    it('should check handlerName not handlerId for hasHandler', () => {
      const filePath = path.join(
        __dirname,
        '../../components/shows/RegistrationWorkflow/InlineHandlerSection.tsx'
      );
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('hasHandler: !!handler?.handlerName');
      expect(content).not.toContain('hasHandler: !!handler?.handlerId');
    });
  });

  describe('RegistrationWizardPage canProceed validation', () => {
    it('should validate handlerName not handlerId in canProceed', () => {
      const filePath = path.join(__dirname, '../../pages/RegistrationWizardPage.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Extract the canProceed function body
      const canProceedStart = content.indexOf('const canProceed');
      const canProceedEnd = content.indexOf('};', canProceedStart);
      const canProceedBody = content.substring(canProceedStart, canProceedEnd);

      // Handler validation should check handlerName
      expect(canProceedBody).toContain('handlerName');
      // Should NOT check handlerId for validation
      expect(canProceedBody).not.toContain('handlerId');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/HandlerAssignment.bugfix.test.tsx`
Expected: FAIL — files still use `handlerId`

- [ ] **Step 3: Fix HandlerAssignmentStep.tsx**

In `apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerAssignmentStep.tsx`, line 55, change:

```typescript
// Before:
hasHandler: !!handler?.handlerId,
// After:
hasHandler: !!handler?.handlerName,
```

- [ ] **Step 4: Fix InlineHandlerSection.tsx**

In `apps/myk9show/src/components/shows/RegistrationWorkflow/InlineHandlerSection.tsx`, line 52, change:

```typescript
// Before:
hasHandler: !!handler?.handlerId,
// After:
hasHandler: !!handler?.handlerName,
```

- [ ] **Step 5: Fix RegistrationWizardPage.tsx canProceed (2 places)**

In `apps/myk9show/src/pages/RegistrationWizardPage.tsx`:

Line 291 (class-selection case):

```typescript
// Before:
return allKeys.every(key => handlerAssignments[key]?.handlerId);
// After:
return allKeys.every(key => handlerAssignments[key]?.handlerName);
```

Line 298 (handler-assignment case):

```typescript
// Before:
allEntryKeys.length > 0 && allEntryKeys.every(key => handlerAssignments[key]?.handlerId);
// After:
allEntryKeys.length > 0 && allEntryKeys.every(key => handlerAssignments[key]?.handlerName);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/HandlerAssignment.bugfix.test.tsx`
Expected: PASS — all 3 tests green

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerAssignmentStep.tsx \
       apps/myk9show/src/components/shows/RegistrationWorkflow/InlineHandlerSection.tsx \
       apps/myk9show/src/pages/RegistrationWizardPage.tsx \
       apps/myk9show/src/test/components/HandlerAssignment.bugfix.test.tsx
git commit -m "fix(registration): check handlerName not handlerId for handler display

handlerId is empty when a dog has no owner, causing !!'' === false.
This made the UI show 'Not assigned' even after a handler name was entered.
Changed hasHandler checks and canProceed validation to use handlerName."
```

---

## Task 2: Add combobox search to HandlerSelectionDialog

**Files:**

- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerSelectionDialog.tsx`
- Create: `apps/myk9show/src/test/components/HandlerSelectionDialog.test.tsx`

- [ ] **Step 1: Write failing tests for the combobox behavior**

Create `apps/myk9show/src/test/components/HandlerSelectionDialog.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Structural tests verifying the HandlerSelectionDialog has been upgraded
 * from a plain text input to a combobox with people search.
 */

describe('HandlerSelectionDialog — Combobox Upgrade', () => {
  const filePath = path.join(
    __dirname,
    '../../components/shows/RegistrationWorkflow/HandlerSelectionDialog.tsx'
  );
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(filePath, 'utf8');
  });

  it('should import useUserStore for people data', () => {
    expect(content).toContain('useUserStore');
  });

  it('should import filterPeopleByName for search', () => {
    expect(content).toContain('filterPeopleByName');
  });

  it('should track selectedPersonIds state', () => {
    expect(content).toContain('selectedPersonIds');
  });

  it('should use selectedPersonIds for handlerId in handleSubmit', () => {
    // Extract handleSubmit body
    const submitStart = content.indexOf('const handleSubmit');
    const submitEnd = content.indexOf('};', submitStart);
    const submitBody = content.substring(submitStart, submitEnd);

    // Should reference selectedPersonIds for the handlerId
    expect(submitBody).toContain('selectedPersonIds');
    // Should NOT unconditionally use dog?.ownerId
    expect(submitBody).not.toMatch(/handlerId:\s*dog\?\.ownerId/);
  });

  it('should determine isOwner by person ID or name match', () => {
    // isOwner should check selectedPersonIds against dog.ownerId
    expect(content).toContain('selectedPersonIds[dogId]');
  });

  it('should cap filtered results at 10', () => {
    expect(content).toMatch(/\.slice\(0,\s*10\)/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/HandlerSelectionDialog.test.tsx`
Expected: FAIL — dialog doesn't have combobox yet

- [ ] **Step 3: Rewrite HandlerSelectionDialog with combobox**

Replace the full content of `apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerSelectionDialog.tsx` with:

```typescript
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { HandlerInfo } from '@/types/show-registration-types';
import { getDogDisplayName, type Dog } from '@/types/dog-types';
import { useUserStore } from '@/store/userStore';
import { filterPeopleByName } from '@/lib/people-utils';

interface HandlerSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDogs: string[];
  dogs: Dog[];
  onHandlerAssignment: (assignments: Record<string, HandlerInfo>) => void;
  initialAssignments?: Record<string, HandlerInfo>;
}

export const HandlerSelectionDialog: React.FC<HandlerSelectionDialogProps> = ({
  open,
  onOpenChange,
  selectedDogs,
  dogs,
  onHandlerAssignment,
  initialAssignments = {},
}) => {
  const { people, loadPeople, isLoading: peopleLoading } = useUserStore();

  // Load people on mount if not already loaded
  useEffect(() => {
    if (people.length === 0) {
      loadPeople();
    }
  }, [people.length, loadPeople]);

  // Build initial handler name from existing assignment or owner
  const getInitialName = (dogId: string): string => {
    const existing = initialAssignments[dogId];
    if (existing?.handlerName) return existing.handlerName;
    const dog = dogs.find(d => d.id === dogId);
    return dog?.ownerName || '';
  };

  const getInitialPersonId = (dogId: string): string => {
    const existing = initialAssignments[dogId];
    if (existing?.handlerId) return existing.handlerId;
    const dog = dogs.find(d => d.id === dogId);
    return dog?.ownerId || '';
  };

  const [handlerNames, setHandlerNames] = useState<Record<string, string>>(() => {
    const names: Record<string, string> = {};
    selectedDogs.forEach(dogId => {
      names[dogId] = getInitialName(dogId);
    });
    return names;
  });
  const [selectedPersonIds, setSelectedPersonIds] = useState<Record<string, string>>(() => {
    const ids: Record<string, string> = {};
    selectedDogs.forEach(dogId => {
      ids[dogId] = getInitialPersonId(dogId);
    });
    return ids;
  });
  const [focusedDogId, setFocusedDogId] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (focusedDogId) {
        const ref = dropdownRefs.current[focusedDogId];
        if (ref && !ref.contains(e.target as Node)) {
          setFocusedDogId(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [focusedDogId]);

  const handleSubmit = () => {
    // Validate: all dogs must have a handler name
    const allFilled = selectedDogs.every(dogId => handlerNames[dogId]?.trim());
    if (!allFilled) {
      setHasError(true);
      return;
    }

    const assignments: Record<string, HandlerInfo> = {};
    selectedDogs.forEach(dogId => {
      const dog = dogs.find(d => d.id === dogId);
      const name = handlerNames[dogId].trim();
      const personId = selectedPersonIds[dogId] || '';
      const isOwner =
        (!!dog?.ownerId && personId === dog.ownerId) ||
        (!!dog?.ownerName && name.toLowerCase() === dog.ownerName.trim().toLowerCase());

      assignments[dogId] = {
        handlerId: personId,
        handlerName: name,
        isOwner,
      };
    });

    onHandlerAssignment(assignments);
    onOpenChange(false);
  };

  const resetToOwner = (dogId: string) => {
    const dog = dogs.find(d => d.id === dogId);
    if (dog?.ownerName) {
      setHandlerNames(prev => ({ ...prev, [dogId]: dog.ownerName || '' }));
      setSelectedPersonIds(prev => ({ ...prev, [dogId]: dog.ownerId || '' }));
      setHasError(false);
    }
  };

  const handleSelectPerson = (dogId: string, personId: string, personName: string) => {
    setHandlerNames(prev => ({ ...prev, [dogId]: personName }));
    setSelectedPersonIds(prev => ({ ...prev, [dogId]: personId }));
    setFocusedDogId(null);
    setHasError(false);
  };

  const handleInputChange = (dogId: string, value: string) => {
    setHandlerNames(prev => ({ ...prev, [dogId]: value }));
    // Clear person ID when user edits text (they may be typing a different name)
    setSelectedPersonIds(prev => ({ ...prev, [dogId]: '' }));
    setHasError(false);
    setFocusedDogId(dogId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Change Handler</DialogTitle>
          <DialogDescription>
            Search for an existing person or type a handler name.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {selectedDogs.map(dogId => {
            const dog = dogs.find(d => d.id === dogId);
            if (!dog) return null;

            const ownerName = dog.ownerName;
            const currentName = handlerNames[dogId] || '';
            const isModified = !!ownerName && currentName !== ownerName;
            const isEmpty = !currentName.trim();
            const showDropdown = focusedDogId === dogId && currentName.trim().length >= 2;

            return (
              <HandlerDogCard
                key={dogId}
                dogId={dogId}
                dog={dog}
                ownerName={ownerName}
                currentName={currentName}
                isModified={isModified}
                isEmpty={isEmpty}
                hasError={hasError}
                showDropdown={showDropdown}
                people={people}
                peopleLoading={peopleLoading}
                dropdownRefs={dropdownRefs}
                onInputChange={handleInputChange}
                onInputFocus={() => setFocusedDogId(dogId)}
                onSelectPerson={handleSelectPerson}
                onResetToOwner={resetToOwner}
              />
            );
          })}
        </div>

        <Separator />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Confirm Handler</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Extracted per-dog card with combobox dropdown
interface HandlerDogCardProps {
  dogId: string;
  dog: Dog;
  ownerName: string | undefined;
  currentName: string;
  isModified: boolean;
  isEmpty: boolean;
  hasError: boolean;
  showDropdown: boolean;
  people: ReturnType<typeof useUserStore>['people'];
  peopleLoading: boolean;
  dropdownRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  onInputChange: (dogId: string, value: string) => void;
  onInputFocus: () => void;
  onSelectPerson: (dogId: string, personId: string, personName: string) => void;
  onResetToOwner: (dogId: string) => void;
}

const HandlerDogCard: React.FC<HandlerDogCardProps> = ({
  dogId,
  dog,
  ownerName,
  currentName,
  isModified,
  isEmpty,
  hasError,
  showDropdown,
  people,
  peopleLoading,
  dropdownRefs,
  onInputChange,
  onInputFocus,
  onSelectPerson,
  onResetToOwner,
}) => {
  const filteredPeople = useMemo(() => {
    if (currentName.trim().length < 2) return [];
    return filterPeopleByName(people, currentName).slice(0, 10);
  }, [people, currentName]);

  return (
    <Card className={hasError && isEmpty ? 'border-destructive' : ''}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold">{getDogDisplayName(dog)}</h4>
            <p className="text-sm text-muted-foreground">{dog.breed}</p>
          </div>
          {ownerName && (
            <Badge variant="secondary" className="text-xs">
              Owner: {ownerName}
            </Badge>
          )}
        </div>

        <FormField
          label="Handler name"
          fieldId={`handler-${dogId}`}
          error={hasError && isEmpty ? 'Please enter a handler name' : undefined}
        >
          <div
            className="relative"
            ref={el => {
              dropdownRefs.current[dogId] = el;
            }}
          >
            <div className="flex gap-2">
              <Input
                id={`handler-${dogId}`}
                value={currentName}
                onChange={e => onInputChange(dogId, e.target.value)}
                onFocus={onInputFocus}
                placeholder="Search for a person or type a name"
                aria-invalid={hasError && isEmpty}
                aria-describedby={hasError && isEmpty ? `handler-${dogId}-error` : undefined}
                autoComplete="off"
              />
              {isModified && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onResetToOwner(dogId)}
                  title="Reset to owner"
                  className="shrink-0"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Dropdown results */}
            {showDropdown && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-auto">
                {filteredPeople.length > 0 ? (
                  filteredPeople.map(person => {
                    const fullName =
                      `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();
                    return (
                      <button
                        key={person.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                        onMouseDown={e => {
                          e.preventDefault(); // Prevent input blur before click registers
                          onSelectPerson(dogId, person.id, fullName);
                        }}
                      >
                        <div className="font-medium">{fullName}</div>
                        {person.email && (
                          <div className="text-xs text-muted-foreground">{person.email}</div>
                        )}
                      </button>
                    );
                  })
                ) : peopleLoading ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Loading...
                  </div>
                ) : (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No matches — press Confirm to use this name
                  </div>
                )}
              </div>
            )}
          </div>
        </FormField>
      </CardContent>
    </Card>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/HandlerSelectionDialog.test.tsx`
Expected: PASS — all 6 tests green

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 6: Run full test suite**

Run: `cd apps/myk9show && pnpm vitest run --reporter=verbose 2>&1 | tail -20`
Expected: No new failures

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/HandlerSelectionDialog.tsx \
       apps/myk9show/src/test/components/HandlerSelectionDialog.test.tsx
git commit -m "feat(registration): add people search to handler selection dialog

Replace plain text input with combobox that searches the people table.
Selecting a match captures their person ID; typing a name not in the
system falls back to free text. Uses useUserStore + filterPeopleByName,
same pattern as judge selection in the show creation wizard."
```

---

## Task 3: Verify end-to-end and clean up

**Files:**

- Review: all 4 modified files + 2 test files

- [ ] **Step 1: Run all registration-related tests together**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/HandlerAssignment.bugfix.test.tsx src/test/components/HandlerSelectionDialog.test.tsx src/test/components/RegistrationWorkflow.simple.test.tsx`
Expected: All tests PASS

- [ ] **Step 2: Run full typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: Clean

- [ ] **Step 3: Update memory file to mark bug as resolved**

Update `/Users/richardbeezley/.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/project_handler_assignment_bug.md` to note the fix is complete and how it was resolved.

- [ ] **Step 4: Final commit if any cleanup was needed**

Only if steps 1-2 required fixes.
