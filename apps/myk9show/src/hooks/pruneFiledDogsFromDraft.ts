import type { DraftMetadata, SavedDraft } from './draftMetadata';
import { makeHandlerKey } from '@/types/show-registration-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

export interface HandledDraftClass {
  dogId: string;
  classId: string;
}

/** Remove handled class lines while keeping denied or unrelated entry work. */
export function pruneFiledDogsFromDraft(
  draft: SavedDraft,
  handledClassKeys: ReadonlySet<string>,
  handledDogIds: ReadonlySet<string>
): SavedDraft | null {
  const selectedDogs = draft.data.selectedDogs ?? [];
  const workflowState = draft.data._workflowState;
  if (!workflowState) {
    if (!selectedDogs.some(id => handledDogIds.has(id))) return draft;
    const remainingDogs = selectedDogs.filter(id => !handledDogIds.has(id));
    if (remainingDogs.length === 0) return null;
    return {
      metadata: {
        ...draft.metadata,
        preview: `${remainingDogs.length} dog${remainingDogs.length === 1 ? '' : 's'}`,
      },
      data: {
        ...draft.data,
        selectedDogs: remainingDogs,
        paymentMethod: undefined,
        registrationNumber: undefined,
      },
    };
  }

  const classSelections = workflowState.classSelections
    .map(selection => ({
      ...selection,
      selectedClasses: selection.selectedClasses.filter(
        selectedClass =>
          !handledClassKeys.has(makeHandlerKey(selection.dogId, selectedClass.classId))
      ),
    }))
    .filter(selection => selection.selectedClasses.length > 0);
  const originalKeys = workflowState.classSelections.flatMap(selection =>
    selection.selectedClasses.map(selectedClass =>
      makeHandlerKey(selection.dogId, selectedClass.classId)
    )
  );
  const dogsWithClasses = new Set(
    workflowState.classSelections
      .filter(selection => selection.selectedClasses.length > 0)
      .map(selection => selection.dogId)
  );
  if (
    !originalKeys.some(key => handledClassKeys.has(key)) &&
    !selectedDogs.some(id => handledDogIds.has(id) && !dogsWithClasses.has(id))
  ) {
    return draft;
  }

  const dogsWithRemainingClasses = new Set(classSelections.map(selection => selection.dogId));
  const remainingDogs = selectedDogs.filter(
    id =>
      (dogsWithClasses.has(id) && dogsWithRemainingClasses.has(id)) ||
      (!dogsWithClasses.has(id) && !handledDogIds.has(id))
  );
  if (remainingDogs.length === 0) return null;

  const remainingIds = new Set(remainingDogs);
  const remainingClassKeys = new Set(
    classSelections.flatMap(selection =>
      selection.selectedClasses.map(selectedClass =>
        makeHandlerKey(selection.dogId, selectedClass.classId)
      )
    )
  );
  const remainingClasses = classSelections.reduce(
    (total, selection) => total + selection.selectedClasses.length,
    0
  );
  const preview = `${remainingDogs.length} dog${remainingDogs.length === 1 ? '' : 's'}${remainingClasses ? `, ${remainingClasses} class${remainingClasses === 1 ? '' : 'es'}` : ''}`;

  return {
    metadata: {
      ...draft.metadata,
      timestamp: Date.now(),
      stepCompleted: 'dog-selection',
      preview,
      selectedDogsCount: remainingDogs.length,
      completed: false,
    },
    data: {
      ...draft.data,
      selectedDogs: remainingDogs,
      paymentMethod: undefined,
      registrationNumber: undefined,
      ...(draft.data.entries && {
        entries: draft.data.entries
          .filter(entry => remainingIds.has(entry.dogId))
          .map(entry => ({
            ...entry,
            classes: entry.classes.filter(
              classEntry => !handledClassKeys.has(makeHandlerKey(entry.dogId, classEntry.classId))
            ),
          })),
      }),
      _workflowState: {
        ...workflowState,
        currentStep: 'dog-selection',
        stepCompletionState: {},
        paymentStatus: PaymentStatus.PENDING,
        entryStatus: EntryStatus.PENDING,
        classSelections,
        handlerAssignments: Object.fromEntries(
          Object.entries(workflowState.handlerAssignments).filter(([key]) =>
            remainingClassKeys.has(key)
          )
        ),
      },
    },
  };
}

export function pruneStoredDrafts(input: {
  metadata: DraftMetadata[];
  keyFor: (id: string) => string;
  showId: string;
  userId: string;
  handledClassKeys: ReadonlySet<string>;
  handledDogIds: ReadonlySet<string>;
  activeId?: string | undefined;
  onError: (id: string, error: unknown) => void;
}): { remainingMetadata: DraftMetadata[]; remainingActive: DraftMetadata | null } {
  const remainingMetadata: DraftMetadata[] = [];
  let remainingActive: DraftMetadata | null = null;
  for (const metadata of input.metadata) {
    try {
      const raw = localStorage.getItem(input.keyFor(metadata.id));
      if (!raw) continue;
      const saved: SavedDraft = JSON.parse(raw);
      if (
        saved.metadata?.id !== metadata.id ||
        saved.metadata.showId !== input.showId ||
        saved.metadata.userId !== input.userId
      ) {
        remainingMetadata.push(metadata);
        continue;
      }
      const pruned = pruneFiledDogsFromDraft(saved, input.handledClassKeys, input.handledDogIds);
      if (!pruned) {
        localStorage.removeItem(input.keyFor(metadata.id));
      } else if (pruned !== saved) {
        localStorage.setItem(input.keyFor(metadata.id), JSON.stringify(pruned));
        remainingMetadata.push(pruned.metadata);
        if (metadata.id === input.activeId) remainingActive = pruned.metadata;
      } else {
        remainingMetadata.push(metadata);
        if (metadata.id === input.activeId) remainingActive = metadata;
      }
    } catch (error) {
      input.onError(metadata.id, error);
      remainingMetadata.push(metadata);
    }
  }
  return { remainingMetadata, remainingActive };
}
