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
export function useRegistrationConflicts(showId: string, registrationId?: string) {
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
    autoRefresh: false, // Disable auto-refresh for registration workflow
    enableNotifications: false // Don't show notifications during normal workflow
  });

  // Derived state from conflict resolution
  const conflictCount = conflicts.length;
  const hasConflicts = conflictCount > 0;
  const getConflictStats = () => stats;

  // Check for conflicts function using the conflict manager
  const checkForConflicts = useCallback((
    conflictType: string,
    entityId: string,
    localData: unknown,
    serverData: unknown,
    metadata?: {
      lastModifiedBy?: string;
      lastModifiedAt?: Date;
    }
  ) => {
    try {
      // Create a conflict ID
      const conflictId = `${conflictType}_${entityId}_${Date.now()}`;
      
      // Simple comparison to detect conflicts
      const hasActualConflict = JSON.stringify(localData) !== JSON.stringify(serverData);
      
      if (hasActualConflict) {
        // For now, just log the conflict and return the ID
        // We can enhance this later to integrate with the conflict manager properly
        console.log('Conflict detected:', {
          conflictId,
          conflictType,
          entityId,
          localData,
          serverData,
          metadata
        });

        return conflictId;
      }
      
      return null;
    } catch (error) {
      console.error('Error checking for conflicts:', error);
      return null;
    }
  }, []);

  // Dismiss conflict function
  const dismissConflict = useCallback((conflictId: string) => {
    try {
      // Find and remove the conflict
      const conflict = conflicts.find(c => c.id === conflictId);
      if (conflict) {
        console.log('Dismissing conflict:', conflictId);
        // For now, just log the dismissal
        // We can enhance this later to integrate with the conflict manager properly
        refreshConflicts();
      }
    } catch (error) {
      console.error('Error dismissing conflict:', error);
    }
  }, [conflicts, refreshConflicts]);

  // Clear all conflicts function
  const clearAllConflicts = useCallback(() => {
    try {
      console.log('Clearing all conflicts');
      // For now, just log the action
      // We can enhance this later to integrate with the conflict manager properly
      refreshConflicts();
    } catch (error) {
      console.error('Error clearing all conflicts:', error);
    }
  }, [refreshConflicts]);

  // Check for registration data conflicts with server
  const checkRegistrationConflicts = useCallback(async (
    localRegistrationData: RegistrationFormData,
    serverRegistrationData?: ShowRegistration
  ) => {
    if (!registrationId) return null;

    // Skip conflict checking if this is a new registration or during initial workflow
    const registration = getRegistration(registrationId);
    if (!registration || registration.status === 'draft') {
      // No conflicts for draft registrations
      return null;
    }

    setIsCheckingConflicts(true);

    try {
      // Get latest server data if not provided
      const serverData = serverRegistrationData || registration;
      
      if (!serverData) {
        console.log('No server data found for registration:', registrationId);
        return null;
      }

      // Check for conflicts in different aspects of registration
      const conflictResults = [];

      // Check dog selection conflicts
      const localDogs = localRegistrationData.selectedDogs || [];
      const serverDogs = serverData.entries.map(entry => entry.dogId);
      
      if (JSON.stringify(localDogs.sort()) !== JSON.stringify(serverDogs.sort())) {
        const conflictId = checkForConflicts(
          'dog_selection',
          registrationId,
          { selectedDogs: localDogs },
          { selectedDogs: serverDogs },
          {
            lastModifiedBy: serverData.lastModifiedByUserId,
            lastModifiedAt: serverData.updatedAt
          }
        );
        if (conflictId) conflictResults.push(conflictId);
      }

      // Check payment status conflicts
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
            lastModifiedBy: serverData.lastModifiedByUserId,
            lastModifiedAt: serverData.updatedAt
          }
        );
        if (conflictId) conflictResults.push(conflictId);
      }

      // Check overall registration status
      if (serverData.status === 'submitted' || serverData.status === 'confirmed') {
        const conflictId = checkForConflicts(
          'registration',
          registrationId,
          { status: 'draft', data: localRegistrationData },
          { status: serverData.status, data: serverData },
          {
            lastModifiedBy: serverData.lastModifiedByUserId,
            lastModifiedAt: serverData.updatedAt
          }
        );
        if (conflictId) conflictResults.push(conflictId);
      }

      return conflictResults;
    } catch (error) {
      console.error('Error checking registration conflicts:', error);
      return null;
    } finally {
      setIsCheckingConflicts(false);
    }
  }, [registrationId, getRegistration, checkForConflicts]);

  // Check for class selection conflicts
  const checkClassSelectionConflicts = useCallback(async (
    localClassSelections: ClassSelectionData[],
    serverRegistration?: ShowRegistration
  ) => {
    if (!registrationId) return null;

    const serverData = serverRegistration || getRegistration(registrationId);
    if (!serverData) return null;

    // Convert server entries to class selection format for comparison
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
          lastModifiedBy: serverData.lastModifiedByUserId,
          lastModifiedAt: serverData.updatedAt
        }
      );
    }

    return null;
  }, [registrationId, getRegistration, checkForConflicts]);

  // Check for handler assignment conflicts
  const checkHandlerConflicts = useCallback(async (
    localHandlerAssignments: Record<string, HandlerInfo>,
    serverRegistration?: ShowRegistration
  ) => {
    if (!registrationId) return null;

    const serverData = serverRegistration || getRegistration(registrationId);
    if (!serverData) return null;

    // Extract handler assignments from server data
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
          lastModifiedBy: serverData.lastModifiedByUserId,
          lastModifiedAt: serverData.updatedAt
        }
      );
    }

    return null;
  }, [registrationId, getRegistration, checkForConflicts]);

  // Resolve a registration conflict with smart merging
  const resolveRegistrationConflict = useCallback(async (conflictId: string, resolution: { action: string; mergedData?: unknown; reason?: string; [key: string]: unknown }) => {
    // Map the action to ResolutionStrategy
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
        // Apply the resolved data to the registration
        switch (resolution.action) {
          case 'merge':
          case 'overwrite':
            // Update the registration with merged/overwritten data
            if (resolution.mergedData && typeof resolution.mergedData === 'object' && 'selectedDogs' in resolution.mergedData) {
              // Handle dog selection changes
              console.log('Applying dog selection resolution:', resolution.mergedData.selectedDogs);
            }
            
            if (resolution.mergedData && typeof resolution.mergedData === 'object' && 'classSelections' in resolution.mergedData) {
              // Handle class selection changes
              console.log('Applying class selection resolution:', resolution.mergedData.classSelections);
            }
            
            if (resolution.mergedData && typeof resolution.mergedData === 'object' && 'handlerAssignments' in resolution.mergedData) {
              // Handle handler assignment changes
              console.log('Applying handler assignment resolution:', resolution.mergedData.handlerAssignments);
            }
            
            if (resolution.mergedData && typeof resolution.mergedData === 'object' && ('paymentMethod' in resolution.mergedData || 'paymentStatus' in resolution.mergedData)) {
              // Handle payment changes
              console.log('Applying payment resolution:', {
                method: 'paymentMethod' in resolution.mergedData ? resolution.mergedData.paymentMethod : undefined,
                status: 'paymentStatus' in resolution.mergedData ? resolution.mergedData.paymentStatus : undefined
              });
            }
            break;
            
          case 'discard':
            // Refresh from server to get latest data
            console.log('Discarding local changes, refreshing from server');
            // This would trigger a refresh of the local state
            break;
        }

        toast.success('Conflict resolved successfully', {
          description: resolution.reason || 'Changes have been applied'
        });

        return conflictResolution;
      }

      return conflictResolution;
    } catch (error) {
      console.error('Error applying conflict resolution:', error);
      toast.error('Failed to apply conflict resolution', {
        description: 'Please try again or refresh the page'
      });
      throw error;
    }
  }, [resolveConflict, registrationId]);

  // Auto-check for conflicts periodically
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

    if (foundConflicts.length > 0) {
      console.log('Found registration conflicts:', foundConflicts);
    }

    return foundConflicts;
  }, [registrationId, checkRegistrationConflicts, checkClassSelectionConflicts, checkHandlerConflicts]);

  // Get the currently selected conflict for the dialog
  const selectedConflict = selectedConflictId ? 
    conflicts.find(c => c.id === selectedConflictId) || null : null;

  return {
    // Conflict state
    conflicts,
    conflictCount,
    hasConflicts,
    isCheckingConflicts,
    isResolving,
    
    // Conflict management
    checkForConflicts,
    checkRegistrationConflicts,
    checkClassSelectionConflicts,
    checkHandlerConflicts,
    performConflictCheck,
    resolveConflict: resolveRegistrationConflict,
    dismissConflict,
    clearAllConflicts,
    
    // Statistics
    getConflictStats,
    
    // Dialog state
    selectedConflict,
    setSelectedConflictId,
    
    // Quick actions
    hasActiveConflicts: conflictCount > 0,
    needsAttention: conflicts.some(c => c.entityType === 'registration')
  };
}