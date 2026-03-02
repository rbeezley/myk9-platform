/**
 * Types for ClassDetailsPage
 */

import type { ClassData, CompetitionResult } from '@/components/classes/types/classTypes';
import type { ShowEntry } from '@/types/entry-lifecycle';

export interface ClassEntryDisplay {
  id: string;
  armband: string;
  handler: string;
  dog: string;
  status: 'Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn' | 'Eliminated';
  qualificationReason?: string;
  score: string;
  time: string;
  placement: string;
  classId: string;
}

export interface DialogState {
  editClassPanelOpen: boolean;
  editEntryDialogOpen: boolean;
  deleteDialogOpen: boolean;
  editEntryId: string | null;
  deleteEntryDialogOpen: boolean;
  entryToDelete: string | null;
}

export type { ClassData, CompetitionResult, ShowEntry };
