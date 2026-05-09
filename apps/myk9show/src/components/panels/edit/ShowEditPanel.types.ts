/**
 * ShowEditPanel - Type Definitions
 */

import type { Show } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { ShowStyle } from '@/features/registries';
import type { GeneratedPremium } from '@/types/premium-types';

export interface ShowEditPanelProps {
  open: boolean;
  onClose: () => void;
  showId: string;
  showName: string;
  initialShowData: Partial<Show>;
  onSave?: (showData: ShowEditSaveData) => Promise<void>;
  enableAutoSave?: boolean;
  showAdvancedFields?: boolean;
}

export interface ShowEditSaveData extends Partial<Show> {
  publishExperience?: boolean;
  generatedPremium?: GeneratedPremium;
  inkSaver?: boolean;
}

// Form data interface extending ShowInput for edit panel needs
export interface ShowEditFormData extends Record<string, unknown> {
  id?: string;
  name: string;
  status: string;
  organization: string;
  clubId: string;
  startDate: string;
  endDate: string;
  location: string;
  entryOpenDate: string;
  entryCloseDate: string;
  preEntryFee: string;
  dayOfShowFee: string;
  assignedJudges: ShowJudgeAssignment[];
  // Additional optional fields
  startingArmbandNumber?: number;
  maxEntriesPerDog?: number;
  maxTotalEntries?: number;
  allowNonOwnerHandlers?: boolean;
  acceptCheckPayments?: boolean;
  acceptCashPayments?: boolean;
  clubName?: string;
  logoUrl?: string;
  trials?: Show['trials'];
  /** Experience style — drives all 4 touchpoints (migration 195) */
  style: ShowStyle;
  publishExperience?: boolean;
  generatedPremium?: GeneratedPremium;
  inkSaver?: boolean;
  experiencePublishedContent?: Show['experiencePublishedContent'];
}
