import { useCallback, useState } from 'react';
import { useConflictResolution } from './useConflictResolution';
import { useShowRegistrationStore } from '../store/showRegistrationStore';
import {
  RegistrationFormData,
  ClassSelectionData,
  HandlerInfo,
  PaymentStatus,
  ShowRegistration
} from '../types/show-registration-types';
import { toast } from 'sonner';
import type { ResolutionStrategy } from '../types/conflict-types';

export interface RegistrationConflictData {
  registrationId: string;
  showId: string;
  conflictType: 'registration' | 'dog_selection' | 'class_selection' | 'handler_assignment' | 'payment' | 'entry_status';
  localData: unknown;
  serverData: unknown;
  lastModifiedBy?: string;
  lastModifiedAt?: Date;
}

/**
 * Hook for managing conflicts in registration workflow
 */
export function useRegistrationConflicts(_showId: string, registrationId?: string) {
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);

  const {
    getRegistration
  } = useShowRegistrationStore();

  const {
    conflicts,
    stats,
    isLoading: isResolving,
    resolveConflict,
    refreshConflicts
  } = useConflictResolution({
    entityType: 'registration',
    autoRefresh: false,
    enableNotifications: false
  });

  const conflictCount = conflicts.length;
  const hasConflicts = conflictCount > 0;
  const getConflictStats = () => stats;

  const checkForConflicts = useCallback((
    conflictType: string,
    entityId: string,
    localData: unknown,
    serverData: unknown,
    _metadata?: {
      lastModifiedBy?: string;
      lastModifiedAt?: Date;
    }
  ) => {
    try {
      const conflictId = `${conflictType}_${entityId}_${Date.now()}`;
      const hasActualConflict = JSON.stringify(localData) !== JSON.stringify(serverData);

      if (hasActualConflict) {
        return conflictId;
      }

      return null;
    } catch {
      return null;
    }
  }, []);

  const dismissConflict = useCallback((conflictId: string) => {
    try {
      const conflict = conflicts.find(c => c.id === conflictId);
      if (conflict) {
        refreshConflicts();
      }
    } catch {
      // Ignore errors
    }
  }, [conflicts, refreshConflicts]);

  const clearAllConflicts = useCallback(() => {
    try {
      refreshConflicts();
    } catch {
      // Ignore errors
    }
  }, [refreshConflicts]);

  const checkRegistrationConflicts = useCallback(async (
    localRegistrationData: RegistrationFormData,
    serverRegistrationData?: ShowRegistration
  ) => {
    if (!registrationId) return null;

    const registration = getRegistration(registrationId);
    if (!registration || registration.status === 'draft') {
      return null;
    }

    setIsCheckingConflicts(true);

    try {
      const serverData = serverRegistrationData || registration;

      if (!serverData) {
        return null;
      }

      const conflictResults: string[] = [];

      const localDogs = localRegistrationData.selectedDogs || [];
      const serverDogs = serverData.entries.map(entry => entry.dogId);

      if (JSON.stringify(localDogs.sort()) !== JSON.stringify(serverDogs.sort())) {
        const conflictId = checkForConflicts(
          'dog_selection',
          registrationId,
          { selectedDogs: localDogs },
          { selectedDogs: serverDogs },
          {
            ...(serverData.lastModifiedByUserId !== undefined && { lastModifiedBy: serverData.lastModifiedByUserId }),
            lastModifiedAt: serverData.updatedAt
          }
        );
        if (conflictId) conflictResults.push(conflictId);
      }

      if (localRegistrationData.paymentMethod &&
          localRegistrationData.paymentMethod !== serverData.paymentMethod) {
        const conflictId = checkForConflicts(
          'payment',
          registrationId,
          {
            paymentMethod: localRegistrationData.paymentMethod,
            paymentStatus: PaymentStatus.PENDING
          },
          {
            paymentMethod: serverData.paymentMethod,
            paymentStatus: serverData.paymentStatus
          },
          {
            ...(serverData.lastModifiedByUserId !== undefined && { lastModifiedBy: serverData.lastModifiedByUserId }),
            lastModifiedAt: serverData.updatedAt
          }
        );
        if (conflictId) conflictResults.push(conflictId);
      }

      if (serverData.status === 'submitted' || serverData.status === 'confirmed') {
        const conflictId = checkForConflicts(
          'registration',
          registrationId,
          { status: 'draft', data: localRegistrationData },
          { status: serverData.status, data: serverData },
          {
            ...(serverData.lastModifiedByUserId !== undefined && { lastModifiedBy: serverData.lastModifiedByUserId }),
            lastModifiedAt: serverData.updatedAt
          }
        );
        if (conflictId) conflictResults.push(conflictId);
      }

      return conflictResults;
    } catch {
      return null;
    } finally {
      setIsCheckingConflicts(false);
    }
  }, [registrationId, getRegistration, checkForConflicts]);

  const checkClassSelectionConflicts = useCallback(async (
    localClassSelections: ClassSelectionData[],
    serverRegistration?: ShowRegistration
  ) => {
    if (!registrationId) return null;

    const serverData = serverRegistration || getRegistration(registrationId);
    if (!serverData) return null;

    const serverClassSelections: ClassSelectionData[] = serverData.entries.map(entry => ({
      dogId: entry.dogId,
      trialId: entry.trialId,
      selectedClasses: entry.classes.map(cls => ({
        classId: cls.classId,
        jumpHeight: cls.jumpHeight,
        moveUpRequested: cls.moveUpRequested
      }))
    }));

    const localString = JSON.stringify(localClassSelections.sort((a, b) => a.dogId.localeCompare(b.dogId)));
    const serverString = JSON.stringify(serverClassSelections.sort((a, b) => a.dogId.localeCompare(b.dogId)));

    if (localString !== serverString) {
      return checkForConflicts(
        'class_selection',
        registrationId,
        { classSelections: localClassSelections },
        { classSelections: serverClassSelections },
        {
          ...(serverData.lastModifiedByUserId !== undefined && { lastModifiedBy: serverData.lastModifiedByUserId }),
          lastModifiedAt: serverData.updatedAt
        }
      );
    }

    return null;
  }, [registrationId, getRegistration, checkForConflicts]);

  const checkHandlerConflicts = useCallback(async (
    localHandlerAssignments: Record<string, HandlerInfo>,
    serverRegistration?: ShowRegistration
  ) => {
    if (!registrationId) return null;

    const serverData = serverRegistration || getRegistration(registrationId);
    if (!serverData) return null;

    const serverHandlerAssignments: Record<string, HandlerInfo> = {};
    serverData.entries.forEach(entry => {
      if (entry.handler) {
        serverHandlerAssignments[entry.dogId] = {
          handlerId: entry.handler.id,
          handlerName: entry.handler.name,
          isOwner: entry.handler.isOwner
        };
      }
    });

    const localString = JSON.stringify(localHandlerAssignments);
    const serverString = JSON.stringify(serverHandlerAssignments);

    if (localString !== serverString) {
      return checkForConflicts(
        'handler_assignment',
        registrationId,
        { handlerAssignments: localHandlerAssignments },
        { handlerAssignments: serverHandlerAssignments },
        {
          ...(serverData.lastModifiedByUserId !== undefined && { lastModifiedBy: serverData.lastModifiedByUserId }),
          lastModifiedAt: serverData.updatedAt
        }
      );
    }

    return null;
  }, [registrationId, getRegistration, checkForConflicts]);

  const resolveRegistrationConflict = useCallback(async (
    conflictId: string,
    resolution: { action: string; mergedData?: unknown; reason?: string; [key: string]: unknown }
  ) => {
    const strategyMap: Record<string, ResolutionStrategy> = {
      'merge': 'merge_manual',
      'overwrite': 'newest_wins',
      'discard': 'local_wins',
      'manual': 'user_decides'
    };

    const strategy = strategyMap[resolution.action] || 'user_decides';

    try {
      const conflictResolution = await resolveConflict(conflictId, strategy, resolution.mergedData);

      if (conflictResolution && registrationId && resolution.mergedData) {
        toast.success('Conflict resolved successfully', {
          description: resolution.reason || 'Changes have been applied'
        });

        return conflictResolution;
      }

      return conflictResolution;
    } catch (error) {
      toast.error('Failed to apply conflict resolution', {
        description: 'Please try again or refresh the page'
      });
      throw error;
    }
  }, [resolveConflict, registrationId]);

  const performConflictCheck = useCallback(async (
    localData: {
      formData: RegistrationFormData;
      classSelections: ClassSelectionData[];
      handlerAssignments: Record<string, HandlerInfo>;
    }
  ) => {
    if (!registrationId) return;

    const conflictPromises = [
      checkRegistrationConflicts(localData.formData),
      checkClassSelectionConflicts(localData.classSelections),
      checkHandlerConflicts(localData.handlerAssignments)
    ];

    const results = await Promise.all(conflictPromises);
    const foundConflicts = results.filter(Boolean).flat();

    return foundConflicts;
  }, [registrationId, checkRegistrationConflicts, checkClassSelectionConflicts, checkHandlerConflicts]);

  const selectedConflict = selectedConflictId ?
    conflicts.find(c => c.id === selectedConflictId) || null : null;

  return {
    conflicts,
    conflictCount,
    hasConflicts,
    isCheckingConflicts,
    isResolving,

    checkForConflicts,
    checkRegistrationConflicts,
    checkClassSelectionConflicts,
    checkHandlerConflicts,
    performConflictCheck,
    resolveConflict: resolveRegistrationConflict,
    dismissConflict,
    clearAllConflicts,

    getConflictStats,

    selectedConflict,
    setSelectedConflictId,

    hasActiveConflicts: conflictCount > 0,
    needsAttention: conflicts.some(c => c.entityType === 'registration')
  };
}
