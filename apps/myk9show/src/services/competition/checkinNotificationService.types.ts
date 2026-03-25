import type { CheckInStatus } from '../../types/check-in-types';
import type { Priority } from '../../types/realtime-types';

export interface CheckInEvent {
  id: string;
  entryId: string;
  dogId: string;
  dogName: string;
  ownerName: string;
  exhibitorName: string;
  armband: string;
  classId: string;
  className: string;
  checkInStatus: CheckInStatus;
  previousStatus: CheckInStatus;
  timestamp: Date;
  location?: string | undefined;
  checkedInBy: string;
  ringAssignment?: string | undefined;
  sequence: number;
  estimatedRingTime?: Date | undefined;
  notes?: string | undefined;
}

export interface CheckInNotification {
  id: string;
  type: 'check-in' | 'late-arrival' | 'conflict-detected' | 'status-change' | 'queue-update';
  priority: Priority;
  title: string;
  message: string;
  subMessage?: string;
  checkInEvent: CheckInEvent;
  targetRoles: Array<'secretary' | 'steward' | 'judge' | 'exhibitor'>;
  targetUsers?: string[]; // Specific user IDs
  expiresAt: Date;
  persistent: boolean; // Should this persist until acknowledged?
  actionRequired: boolean;
  actionLabel?: string;
  actionUrl?: string;
  timestamp: Date;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface CheckInQueueStatus {
  classId: string;
  className: string;
  totalEntries: number;
  checkedInCount: number;
  pendingCount: number;
  conflictCount: number;
  lateArrivals: number;
  estimatedStartTime: Date;
  actualStartTime?: Date;
  averageCheckInTime: number; // seconds
  lastUpdated: Date;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface CheckInMetrics {
  showId: string;
  totalNotificationsSent: number;
  checkInsProcessed: number;
  conflictsDetected: number;
  lateArrivals: number;
  averageNotificationDelay: number; // ms
  peakCheckInRate: number; // per minute
  lastActivity: Date;
}
