import type { SavedDraft } from './useDraftPersistence';

/** Remove submitted dog work while keeping other dogs in the same local draft. */
export function pruneFiledDogsFromDraft(
  draft: SavedDraft,
  filedDogIds: ReadonlySet<string>
): SavedDraft | null {
  const selectedDogs = draft.data.selectedDogs ?? [];
  if (!selectedDogs.some(id => filedDogIds.has(id))) return draft;

  const remainingDogs = selectedDogs.filter(id => !filedDogIds.has(id));
  if (remainingDogs.length === 0) return null;

  const remainingIds = new Set(remainingDogs);
  const workflowState = draft.data._workflowState;
  const classSelections = workflowState
    ? workflowState.classSelections.filter(selection => remainingIds.has(selection.dogId))
    : [];
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
        entries: draft.data.entries.filter(entry => remainingIds.has(entry.dogId)),
      }),
      ...(workflowState && {
        _workflowState: {
          ...workflowState,
          currentStep: 'dog-selection',
          stepCompletionState: {},
          classSelections,
          handlerAssignments: Object.fromEntries(
            Object.entries(workflowState.handlerAssignments).filter(([key]) =>
              remainingIds.has(key.split('|')[0] ?? '')
            )
          ),
        },
      }),
    },
  };
}
