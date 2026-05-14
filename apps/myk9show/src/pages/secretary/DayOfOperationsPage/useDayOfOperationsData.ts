/**
 * Data hook for Day-of Operations Page
 *
 * Manages show selection, classes, entries, and data loading
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getSecretaryShows } from '@/services/database/shows';
import {
  getClassesWithCapacity,
  getScratchableEntries as getPullableEntries,
  getMoveUpEligibleEntries,
  ClassWithCapacity,
} from '@/services/database/day-of-operations';
import type { DayOfOperationEntry, PullableEntry, Show } from './types';

export interface UseDayOfOperationsDataReturn {
  // User
  userId: string | undefined;

  // Shows
  shows: Show[];
  selectedShowId: string;
  setSelectedShowId: (id: string) => void;

  // Loading state
  isLoading: boolean;

  // Data
  classes: ClassWithCapacity[];
  pullableEntries: PullableEntry[];
  moveUpEntries: DayOfOperationEntry[];

  // Actions
  loadData: () => Promise<void>;
}

export function useDayOfOperationsData(): UseDayOfOperationsDataReturn {
  const { user } = useAuth();

  // Show selection
  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Data
  const [classes, setClasses] = useState<ClassWithCapacity[]>([]);
  const [pullableEntries, setPullableEntries] = useState<PullableEntry[]>([]);
  const [moveUpEntries, setMoveUpEntries] = useState<DayOfOperationEntry[]>([]);

  // Load shows on mount
  useEffect(() => {
    const loadShows = async () => {
      if (!user?.id) return;
      const { data } = await getSecretaryShows(user.id);
      if (data) {
        setShows(data);
        if (data.length > 0) {
          setSelectedShowId(data[0].id);
        }
      }
    };
    loadShows();
  }, [user?.id]);

  const loadData = useCallback(async () => {
    if (!selectedShowId) return;
    setIsLoading(true);

    try {
      const [classesRes, pullRes, moveUpRes] = await Promise.all([
        getClassesWithCapacity(selectedShowId),
        getPullableEntries(selectedShowId),
        getMoveUpEligibleEntries(selectedShowId),
      ]);

      if (classesRes.data) setClasses(classesRes.data);
      if (pullRes.data) setPullableEntries(pullRes.data);
      if (moveUpRes.data) setMoveUpEntries(moveUpRes.data);
    } finally {
      setIsLoading(false);
    }
  }, [selectedShowId]);

  // Load data when show changes
  useEffect(() => {
    if (selectedShowId) {
      loadData();
    }
  }, [selectedShowId, loadData]);

  return {
    userId: user?.id,
    shows,
    selectedShowId,
    setSelectedShowId,
    isLoading,
    classes,
    pullableEntries,
    moveUpEntries,
    loadData,
  };
}
