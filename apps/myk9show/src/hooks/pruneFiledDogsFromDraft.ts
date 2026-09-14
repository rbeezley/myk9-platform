import type { SavedDraft } from './useDraftPersistence';
import { makeHandlerKey } from '@/types/show-registration-types';

export interface HandledDraftClass {
  dogId: string;
  classId: string;
}

/** Remove handled class lines while keeping denied or unrelated entry work. */
export function pruneFiledDogsFromDraft(
  draft: SavedDraft,
  handledClassKeys: ReadonlySet<string>
): SavedDraft | null {
  const selectedDogs = draft.data.selectedDogs ?? [];
  const workflowState = draft.data._workflowState;
  if (!workflowState) return draft;

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
  if (!originalKeys.some(key => handledClassKeys.has(key))) return draft;

  const dogsWithClasses = new Set(
    workflowState.classSelections
      .filter(selection => selection.selectedClasses.length > 0)
      .map(selection => selection.dogId)
  );
  const dogsWithRemainingClasses = new Set(classSelections.map(selection => selection.dogId));
  const remainingDogs = selectedDogs.filter(
    id => !dogsWithClasses.has(id) || dogsWithRemainingClasses.has(id)
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
