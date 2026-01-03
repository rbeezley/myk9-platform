import { useState, useCallback, useEffect, useMemo } from 'react';
import { fieldLevelSync } from '../services/sync/FieldLevelSyncService';

interface UseFieldLevelSyncOptions {
  entityType: string;
  entityId: string;
  syncScope?: string;
  includedFields?: string[];
  excludedFields?: string[];
  autoSync?: boolean;
  syncInterval?: number;
  onSyncComplete?: (result: unknown) => void;
  onSyncError?: (error: Error) => void;
}

interface FieldSyncState {
  isSyncing: boolean;
  lastSyncTime: number | null;
  syncedFields: string[];
  pendingChanges: Map<string, { oldValue: unknown; newValue: unknown }>;
  bytesTransferred: number;
  bytesSaved: number;
  error: Error | null;
}

interface UseFieldLevelSyncReturn {
  // State
  syncState: FieldSyncState;
  
  // Methods
  trackFieldChange: (fieldName: string, oldValue: unknown, newValue: unknown) => void;
  syncChangedFields: (entity: Record<string, unknown>) => Promise<void>;
  syncSpecificFields: (entity: Record<string, unknown>, fields: string[]) => Promise<void>;
  clearPendingChanges: () => void;
  
  // Utilities
  getFieldAccessPattern: (fieldName: string) => unknown;
  getBandwidthUsage: () => Map<string, { bytesTransferred: number; bandwidthSaved?: number }>;
  getOptimizationHints: () => string[];
  
  // Configuration
  updateSyncConfig: (config: Partial<UseFieldLevelSyncOptions>) => void;
}

export function useFieldLevelSync(
  options: UseFieldLevelSyncOptions
): UseFieldLevelSyncReturn {
  const [syncState, setSyncState] = useState<FieldSyncState>({
    isSyncing: false,
    lastSyncTime: null,
    syncedFields: [],
    pendingChanges: new Map(),
    bytesTransferred: 0,
    bytesSaved: 0,
    error: null
  });

  const [config, setConfig] = useState(options);

  // Track field changes
  const trackFieldChange = useCallback((
    fieldName: string,
    _oldValue: unknown,
    newValue: unknown
  ) => {
    // Track in service
    fieldLevelSync.trackFieldChange({
      entityType: config.entityType,
      entityId: config.entityId,
      fieldName,
      oldValue: _oldValue,
      newValue,
      timestamp: Date.now(),
      userId: 'current-user', // TODO: Get from auth context
      deviceId: 'current-device' // TODO: Get from device context
    });

    // Track in local state
    setSyncState(prev => {
      const newPendingChanges = new Map(prev.pendingChanges);
      newPendingChanges.set(fieldName, { oldValue: _oldValue, newValue });
      return {
        ...prev,
        pendingChanges: newPendingChanges
      };
    });
  }, [config.entityType, config.entityId]);

  // Sync changed fields
  const syncChangedFields = useCallback(async (entity: Record<string, unknown>) => {
    setSyncState(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      const result = await fieldLevelSync.syncChangedFields(
        config.entityType,
        config.entityId,
        entity,
        {
          syncScope: config.syncScope,
          includedFields: config.includedFields,
          excludedFields: config.excludedFields
        }
      );

      setSyncState(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: Date.now(),
        syncedFields: result.syncedFields,
        pendingChanges: new Map(),
        bytesTransferred: prev.bytesTransferred + result.bytesTransferred,
        bytesSaved: prev.bytesSaved + result.bytesSaved
      }));

      config.onSyncComplete?.(result);
    } catch (error) {
      const err = error as Error;
      setSyncState(prev => ({
        ...prev,
        isSyncing: false,
        error: err
      }));
      config.onSyncError?.(err);
    }
  }, [config]);

  // Sync specific fields only
  const syncSpecificFields = useCallback(async (
    entity: Record<string, unknown>,
    fields: string[]
  ) => {
    // Track changes for specified fields
    fields.forEach(field => {
      if (field in entity) {
        trackFieldChange(field, null, entity[field]);
      }
    });

    // Sync with field filter
    await syncChangedFields(entity);
  }, [trackFieldChange, syncChangedFields]);

  // Clear pending changes
  const clearPendingChanges = useCallback(() => {
    setSyncState(prev => ({
      ...prev,
      pendingChanges: new Map()
    }));
  }, []);

  // Get field access pattern
  const getFieldAccessPattern = useCallback((fieldName: string) => {
    const patterns = fieldLevelSync.getAccessPatterns(config.entityType);
    return patterns.get(fieldName);
  }, [config.entityType]);

  // Get bandwidth usage
  const getBandwidthUsage = useCallback(() => {
    return fieldLevelSync.getBandwidthReport(config.entityType);
  }, [config.entityType]);

  // Get optimization hints
  const getOptimizationHints = useCallback(() => {
    return fieldLevelSync.getOptimizationRecommendations(config.entityType);
  }, [config.entityType]);

  // Update sync configuration
  const updateSyncConfig = useCallback((
    newConfig: Partial<UseFieldLevelSyncOptions>
  ) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  // Auto-sync effect
  useEffect(() => {
    if (!config.autoSync || !config.syncInterval) return;

    const interval = setInterval(() => {
      if (syncState.pendingChanges.size > 0 && !syncState.isSyncing) {
        // Auto-sync would need the entity data
        // In a real app, this would come from a store or context
        console.log('Auto-sync triggered with pending changes:', 
          Array.from(syncState.pendingChanges.keys())
        );
      }
    }, config.syncInterval);

    return () => clearInterval(interval);
  }, [config.autoSync, config.syncInterval, syncState.pendingChanges, syncState.isSyncing]);

  // Memoized return value
  return useMemo(() => ({
    syncState,
    trackFieldChange,
    syncChangedFields,
    syncSpecificFields,
    clearPendingChanges,
    getFieldAccessPattern,
    getBandwidthUsage,
    getOptimizationHints,
    updateSyncConfig
  }), [
    syncState,
    trackFieldChange,
    syncChangedFields,
    syncSpecificFields,
    clearPendingChanges,
    getFieldAccessPattern,
    getBandwidthUsage,
    getOptimizationHints,
    updateSyncConfig
  ]);
}

// Convenience hook for tracking field changes in forms
export function useFieldChangeTracker(
  entityType: string,
  entityId: string
) {
  const trackChange = useCallback((
    fieldName: string,
    oldValue: unknown,
    newValue: unknown
  ) => {
    fieldLevelSync.trackFieldChange({
      entityType,
      entityId,
      fieldName,
      oldValue,
      newValue,
      timestamp: Date.now(),
      userId: 'current-user',
      deviceId: 'current-device'
    });
  }, [entityType, entityId]);

  const trackFieldAccess = useCallback((
    fieldName: string,
    accessType: 'read' | 'write' = 'read'
  ) => {
    fieldLevelSync.trackFieldAccess(entityType, fieldName, accessType);
  }, [entityType]);

  return { trackChange, trackFieldAccess };
}

// Hook for monitoring sync performance
export function useSyncPerformanceMonitor(entityType?: string) {
  const [metrics, setMetrics] = useState({
    totalBytesTransferred: 0,
    totalBytesSaved: 0,
    averageCompressionRatio: 0,
    fieldCount: 0
  });

  const updateMetrics = useCallback(() => {
    const report = fieldLevelSync.getBandwidthReport(entityType);
    
    let totalBytes = 0;
    let totalSaved = 0;
    let fieldCount = 0;
    
    report.forEach(usage => {
      totalBytes += usage.bytesTransferred;
      totalSaved += usage.bandwidthSaved || 0;
      fieldCount++;
    });
    
    setMetrics({
      totalBytesTransferred: totalBytes,
      totalBytesSaved: totalSaved,
      averageCompressionRatio: totalBytes > 0 
        ? (totalBytes + totalSaved) / totalBytes 
        : 1,
      fieldCount
    });
  }, [entityType]);

  useEffect(() => {
    updateMetrics();
    const interval = setInterval(updateMetrics, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [updateMetrics]);

  return metrics;
}