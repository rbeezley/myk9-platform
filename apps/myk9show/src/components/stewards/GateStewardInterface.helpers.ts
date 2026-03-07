/**
 * Pure helper functions for GateStewardInterface.
 */

import { requiresAction } from '@/types/check-in-types';
import type { CheckInStatus } from '@/types/check-in-types';
import type { GateEntry, GateStats } from './GateStewardInterface.types';

/**
 * Filter and sort entries based on search, status, ring, and tab filters.
 */
export function filterAndSortEntries(
  entries: GateEntry[],
  searchTerm: string,
  statusFilter: CheckInStatus | 'all',
  ringFilter: string,
  selectedTab: string
): GateEntry[] {
  let filtered = [...entries];

  // Search filter
  if (searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    filtered = filtered.filter(
      entry =>
        entry.dogName.toLowerCase().includes(searchLower) ||
        entry.handlerName.toLowerCase().includes(searchLower) ||
        entry.armband.includes(searchLower) ||
        entry.entryNumber.toLowerCase().includes(searchLower) ||
        entry.ring.includes(searchLower)
    );
  }

  // Status filter
  if (statusFilter !== 'all') {
    filtered = filtered.filter(entry => entry.checkInStatus === statusFilter);
  }

  // Ring filter
  if (ringFilter !== 'all') {
    filtered = filtered.filter(entry => entry.ring === ringFilter);
  }

  // Tab filter
  switch (selectedTab) {
    case 'needs-attention':
      filtered = filtered.filter(
        entry =>
          requiresAction(entry.checkInStatus) || entry.checkInStatus === 'none' || entry.isUrgent
      );
      break;
    case 'at-gate':
      filtered = filtered.filter(
        entry => entry.checkInStatus === 'at-gate' || entry.checkInStatus === 'go-to-gate'
      );
      break;
    case 'conflicts':
      filtered = filtered.filter(entry => entry.checkInStatus === 'conflict');
      break;
    case 'ready':
      filtered = filtered.filter(entry => entry.checkInStatus === 'checked-in');
      break;
    default:
      // 'all' - no additional filtering
      break;
  }

  // Sort by urgency, then ring, then run order
  filtered.sort((a, b) => {
    if (a.isUrgent && !b.isUrgent) return -1;
    if (!a.isUrgent && b.isUrgent) return 1;
    if (a.ring !== b.ring) return a.ring.localeCompare(b.ring);
    return (a.runOrder || 999) - (b.runOrder || 999);
  });

  return filtered;
}

/**
 * Calculate dashboard statistics from entries.
 */
export function calculateGateStats(entries: GateEntry[]): GateStats {
  return {
    total: entries.length,
    needsAttention: entries.filter(
      e => requiresAction(e.checkInStatus) || e.checkInStatus === 'none' || e.isUrgent
    ).length,
    atGate: entries.filter(e => e.checkInStatus === 'at-gate' || e.checkInStatus === 'go-to-gate')
      .length,
    conflicts: entries.filter(e => e.checkInStatus === 'conflict').length,
    ready: entries.filter(e => e.checkInStatus === 'checked-in').length,
  };
}

/**
 * Generate mock gate entries for development/demo purposes.
 */
export function createMockEntries(): GateEntry[] {
  return [
    {
      id: 'entry_1',
      entryNumber: 'E001',
      armband: '101',
      dogName: 'Bella',
      handlerName: 'Sarah Johnson',
      ownerName: 'Sarah Johnson',
      className: 'Open Standard',
      classNumber: '15',
      ring: '1',
      checkInStatus: 'go-to-gate',
      runOrder: 1,
      estimatedRunTime: new Date(2024, 6, 15, 9, 0),
      judgeAssigned: 'Judge Smith',
      isUrgent: true,
    },
    {
      id: 'entry_2',
      entryNumber: 'E002',
      armband: '102',
      dogName: 'Max',
      handlerName: 'John Davis',
      ownerName: 'John Davis',
      className: 'Open JWW',
      classNumber: '16',
      ring: '1',
      checkInStatus: 'checked-in',
      runOrder: 2,
      estimatedRunTime: new Date(2024, 6, 15, 9, 10),
      judgeAssigned: 'Judge Smith',
      isUrgent: false,
    },
    {
      id: 'entry_3',
      entryNumber: 'E003',
      armband: '103',
      dogName: 'Luna',
      handlerName: 'Emily Wilson',
      ownerName: 'Emily Wilson',
      className: 'Open FAST',
      classNumber: '17',
      ring: '2',
      checkInStatus: 'at-gate',
      runOrder: 1,
      estimatedRunTime: new Date(2024, 6, 15, 9, 0),
      judgeAssigned: 'Judge Brown',
      isUrgent: false,
    },
    {
      id: 'entry_4',
      entryNumber: 'E004',
      armband: '104',
      dogName: 'Charlie',
      handlerName: 'Mike Thompson',
      ownerName: 'Mike Thompson',
      className: 'Open Standard',
      classNumber: '15',
      ring: '1',
      checkInStatus: 'conflict',
      runOrder: 3,
      estimatedRunTime: new Date(2024, 6, 15, 9, 15),
      judgeAssigned: 'Judge Smith',
      isUrgent: true,
    },
    {
      id: 'entry_5',
      entryNumber: 'E005',
      armband: '105',
      dogName: 'Bailey',
      handlerName: 'Lisa Miller',
      ownerName: 'Lisa Miller',
      className: 'Open JWW',
      classNumber: '18',
      ring: '2',
      checkInStatus: 'at-gate',
      runOrder: 8,
      estimatedRunTime: new Date(2024, 6, 15, 9, 20),
      judgeAssigned: 'Judge Davis',
      isUrgent: false,
    },
  ];
}
