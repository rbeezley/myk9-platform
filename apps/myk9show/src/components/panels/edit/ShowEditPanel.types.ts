/**
 * ShowEditPanel - Type Definitions
 */

import type { Show } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';

export interface ShowEditPanelProps {
  open: boolean;
  onClose: () => void;
  showId: string;
  showName: string;
  initialShowData: Partial<Show>;
  onSave?: (showData: Partial<Show>) => Promise<void>;
  enableAutoSave?: boolean;
  showAdvancedFields?: boolean;
}

// Form data interface extending ShowInput for edit panel needs
export interface ShowEditFormData extends Record<string, unknown> {
  name: string;
  status: string;
  organization: string;
  clubId: string;
  startDate: string;
  endDate: string;
  location: string;
  chairman: string;
  secretary: string;
  chiefSteward: string;
  entryOpenDate: string;
  entryCloseDate: string;
  preEntryFee: string;
  dayOfShowFee: string;
  assignedJudges: ShowJudgeAssignment[];
  startingArmbandNumber?: number;
  // Additional optional fields
  maxEntriesPerDog?: number;
  maxTotalEntries?: number;
  allowNonOwnerHandlers?: boolean;
}
