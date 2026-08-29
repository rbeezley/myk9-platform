import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShowStore } from '@/store/showStore';
import { resolveEditMode, type EditModeResolution } from './editModeResolution';
import type { EditMode } from './show-creation-wizard-types';

interface WritableEditModeResolution {
  editModeResolution: EditModeResolution;
  retryWritableShow: () => void;
}

/** Keeps the wizard's edit-mode gate aligned with its Zustand-backed writer. */
export function useWritableEditModeResolution(
  editMode: EditMode | undefined
): WritableEditModeResolution {
  const {
    shows: writableShows,
    isLoading: writableShowsLoading,
    loadShows: loadWritableShows,
  } = useShowStore();
  const editShowId = editMode?.showId;
  const hasWritableEditShow = editShowId
    ? writableShows.some(candidate => candidate.id === editShowId)
    : false;
  const [settledEditShowId, setSettledEditShowId] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);

  const loadWritableShow = useCallback(() => {
    if (!editShowId) return;
    const generation = ++loadGenerationRef.current;
    void loadWritableShows().finally(() => {
      if (loadGenerationRef.current === generation) {
        setSettledEditShowId(editShowId);
      }
    });
  }, [editShowId, loadWritableShows]);

  useEffect(() => {
    if (!editShowId || hasWritableEditShow) {
      loadGenerationRef.current += 1;
      return;
    }

    loadWritableShow();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [editShowId, hasWritableEditShow, loadWritableShow]);

  const retryWritableShow = useCallback(() => {
    setSettledEditShowId(null);
    loadWritableShow();
  }, [loadWritableShow]);

  const editModeResolution = useMemo(
    () =>
      resolveEditMode({
        editMode,
        writableShows,
        showsLoading:
          writableShowsLoading || Boolean(editShowId && settledEditShowId !== editShowId),
      }),
    [editMode, writableShows, writableShowsLoading, editShowId, settledEditShowId]
  );

  return { editModeResolution, retryWritableShow };
}
