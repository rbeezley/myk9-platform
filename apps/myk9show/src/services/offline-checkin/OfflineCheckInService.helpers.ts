import type {
  CheckInEntry,
  CheckInOperation,
  CheckInConflict,
  CheckInValidationResult,
  CheckInStatistics,
  CheckInEvent,
  CheckInEventType,
  OfflineCheckInQueue,
  OfflineCheckInServiceConfig,
} from '@/types/offline-checkin-types';
import type { CheckInStatus } from '@/types/check-in-types';
import { generateId } from '@/utils/idUtils';

/**
 * Map a check-in status to the corresponding operation type.
 */
export function getOperationType(status: CheckInStatus): CheckInOperation['operationType'] {
  switch (status) {
    case 'checked-in':
      return 'check_in';
    case 'pulled':
      return 'scratch';
    default:
      return 'check_in';
  }
}

/**
 * Validate a QR code checksum. Currently a placeholder that always returns true.
 */
export function validateQRChecksum(): boolean {
  // Implement checksum validation logic
  return true; // Placeholder
}

/**
 * Create a CheckInEvent object from event type and data.
 */
export function createCheckInEvent(
  type: CheckInEventType,
  data: Record<string, unknown>,
  getCurrentTime: () => Date
): CheckInEvent {
  return {
    type,
    timestamp: getCurrentTime(),
    data,
    source: 'service',
    priority: 'medium',
  };
}

/**
 * Validate a check-in operation against business rules.
 */
export async function validateCheckIn(
  entryId: string,
  newStatus: CheckInStatus,
  entries: Map<string, CheckInEntry>,
  loadEntriesForClass: (classId: string) => Promise<CheckInEntry[]>,
  getCurrentTime: () => Date
): Promise<CheckInValidationResult[]> {
  const results: CheckInValidationResult[] = [];
  const entry = entries.get(entryId);

  if (!entry) {
    results.push({
      check: 'entry_exists',
      status: 'error',
      message: 'Entry not found',
      details: { entryId },
    });
    return results;
  }

  // Check if already checked in
  if (entry.checkInStatus === 'checked-in' && newStatus === 'checked-in') {
    results.push({
      check: 'duplicate_checkin',
      status: 'warning',
      message: 'Entry is already checked in',
      details: { currentStatus: entry.checkInStatus, checkInTime: entry.checkInTime },
    });
  }

  // Check armband uniqueness for this class
  const classEntries = await loadEntriesForClass(entry.classId);
  const armbandConflict = classEntries.find(
    e => e.id !== entryId && e.armband === entry.armband && e.checkInStatus === 'checked-in'
  );

  if (armbandConflict && newStatus === 'checked-in') {
    results.push({
      check: 'armband_unique',
      status: 'error',
      message: `Armband ${entry.armband} is already checked in for another entry`,
      details: { conflictingEntryId: armbandConflict.id },
    });
  }

  // Check time window
  const now = getCurrentTime();
  if (entry.estimatedStartTime) {
    const timeDiff = entry.estimatedStartTime.getTime() - now.getTime();
    const hoursUntilStart = timeDiff / (1000 * 60 * 60);

    if (hoursUntilStart > 2 && newStatus === 'checked-in') {
      results.push({
        check: 'time_window',
        status: 'warning',
        message: 'Check-in is more than 2 hours before class start',
        details: { hoursUntilStart, estimatedStartTime: entry.estimatedStartTime },
      });
    }

    if (hoursUntilStart < -0.5 && newStatus === 'checked-in') {
      results.push({
        check: 'time_window',
        status: 'error',
        message: 'Class has already started',
        details: { hoursUntilStart, estimatedStartTime: entry.estimatedStartTime },
      });
    }
  }

  // Always pass basic validation if no errors
  if (results.length === 0 || !results.some(r => r.status === 'error')) {
    results.push({
      check: 'entry_exists',
      status: 'pass',
      message: 'Entry validation passed',
    });
  }

  return results;
}

/**
 * Detect armband conflicts among checked-in entries.
 */
export function detectArmbandConflicts(
  entries: Map<string, CheckInEntry>,
  operations: Map<string, CheckInOperation>,
  getCurrentTime: () => Date
): CheckInConflict[] {
  const conflicts: CheckInConflict[] = [];
  const processedArmbands = new Map<string, string[]>(); // key -> entryIds[]

  for (const entry of entries.values()) {
    if (entry.checkInStatus !== 'checked-in') continue;

    const key = `${entry.classId}-${entry.armband}`;
    if (!processedArmbands.has(key)) {
      processedArmbands.set(key, []);
    }

    processedArmbands.get(key)!.push(entry.id);
  }

  // Check for duplicate armbands
  for (const [key, entryIds] of processedArmbands.entries()) {
    if (entryIds.length > 1) {
      const [classId, armband] = key.split('-');
      const conflictEntries = entryIds.map(id => entries.get(id)!);

      conflicts.push({
        id: generateId(),
        type: 'armband_conflict',
        entryId: entryIds[0], // Primary entry
        conflictingData: {
          armband,
          classId,
          conflictingEntries: conflictEntries,
        },
        detectedAt: getCurrentTime(),
        status: 'pending',
        priority: 'high',
        originalOperation: operations.get(entryIds[0]) || ({} as CheckInOperation),
      });
    }
  }

  return conflicts;
}

/**
 * Calculate check-in statistics from current data.
 */
export function calculateStatistics(
  entries: Map<string, CheckInEntry>,
  operations: Map<string, CheckInOperation>,
  conflictsSize: number,
  getCurrentTime: () => Date
): CheckInStatistics {
  const allEntries = Array.from(entries.values());
  const totalEntries = allEntries.length;

  const statusCounts = allEntries.reduce(
    (acc, entry) => {
      acc[entry.checkInStatus] = (acc[entry.checkInStatus] || 0) + 1;
      return acc;
    },
    {} as Record<CheckInStatus, number>
  );

  const ops = Array.from(operations.values());
  const checkInTimes = ops
    .filter(op => op.operationType === 'check_in')
    .map(op => op.performedAt.getTime());

  let averageCheckInTime = 0;
  if (checkInTimes.length > 1) {
    const intervals = checkInTimes
      .sort((a, b) => a - b)
      .slice(1)
      .map((time, i) => time - checkInTimes[i]);
    averageCheckInTime = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  }

  return {
    totalEntries,
    checkedInCount: statusCounts['checked-in'] || 0,
    scratchedCount: statusCounts['pulled'] || 0,
    absentCount: 0, // Will implement when we add absent status
    conflictCount: conflictsSize,
    averageCheckInTime,
    checkInRate:
      checkInTimes.length > 0
        ? (checkInTimes.length / (Date.now() - Math.min(...checkInTimes))) * 60000
        : 0,
    gateStatistics: {}, // Will implement with gate integration
    timeSeriesData: [], // Will implement with time series tracking
    errorRate: ops.filter(op => op.hasErrors).length / Math.max(ops.length, 1),
    conflictRate: conflictsSize / Math.max(totalEntries, 1),
    syncSuccessRate: ops.filter(op => op.isSynced).length / Math.max(ops.length, 1),
    lastUpdated: getCurrentTime(),
  };
}

/**
 * Build the updated CheckInEntry after a check-in operation.
 */
export function buildUpdatedEntry(
  entry: CheckInEntry,
  newStatus: CheckInStatus,
  performedAt: Date,
  performedBy: string,
  options: {
    gateId?: string;
    handlerChange?: string;
    specialRequests?: string;
    scratchReason?: string;
  }
): CheckInEntry {
  return {
    ...entry,
    checkInStatus: newStatus,
    checkInTime: performedAt,
    checkInGate: options.gateId,
    checkInStewardId: performedBy,
    ...(options.handlerChange !== undefined
      ? { handlerChange: options.handlerChange }
      : entry.handlerChange !== undefined
        ? { handlerChange: entry.handlerChange }
        : {}),
    ...(options.specialRequests !== undefined
      ? { specialRequests: options.specialRequests }
      : entry.specialRequests !== undefined
        ? { specialRequests: entry.specialRequests }
        : {}),
    isScratched: newStatus === 'pulled',
    ...(options.scratchReason !== undefined
      ? { scratchReason: options.scratchReason }
      : entry.scratchReason !== undefined
        ? { scratchReason: entry.scratchReason }
        : {}),
    updatedAt: performedAt,
    _sync: {
      _version: (entry._sync?._version ?? 0) + 1,
      _lastModified: performedAt.toISOString(),
      _lastModifiedBy: performedBy,
      _syncStatus: 'pending',
    },
  };
}

/**
 * Build a CheckInOperation record from input parameters.
 */
export function buildCheckInOperation(
  entryId: string,
  entry: CheckInEntry,
  newStatus: CheckInStatus,
  performedBy: string,
  performedAt: Date,
  validationResults: CheckInValidationResult[],
  options: {
    method?: 'qr_scan' | 'manual_entry' | 'bulk_operation';
    gateId?: string;
    deviceId?: string;
    handlerChange?: string;
    specialRequests?: string;
    scratchReason?: string;
    notes?: string;
  }
): CheckInOperation {
  return {
    id: generateId(),
    entryId,
    operationType: getOperationType(newStatus),
    previousStatus: entry.checkInStatus,
    newStatus,
    performedBy,
    performedAt,
    method: options.method || 'manual_entry',
    gateId: options.gateId,
    deviceId: options.deviceId,
    handlerChange: options.handlerChange,
    specialRequests: options.specialRequests,
    scratchReason: options.scratchReason,
    notes: options.notes,
    validationChecks: validationResults,
    hasWarnings: validationResults.some(r => r.status === 'warning'),
    hasErrors: validationResults.some(r => r.status === 'error'),
    isSynced: false,
  };
}

/**
 * Create a new empty offline queue.
 */
export function createOfflineQueue(
  config: OfflineCheckInServiceConfig,
  getCurrentTime: () => Date
): OfflineCheckInQueue {
  return {
    id: generateId(),
    operations: [],
    queuedAt: getCurrentTime(),
    processingErrors: [],
    retryCount: 0,
    maxRetries: config.maxRetries,
    isProcessing: false,
    createdAt: getCurrentTime(),
    updatedAt: getCurrentTime(),
    _sync: {
      _version: 1,
      _lastModified: getCurrentTime().toISOString(),
      _lastModifiedBy: 'system',
      _syncStatus: 'pending',
    },
  };
}
