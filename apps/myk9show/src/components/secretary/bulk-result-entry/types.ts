import type {
  ScentWorkEntry,
  ScentWorkResult,
  MultiAreaScentWorkResult,
  ScentWorkClassConfig,
  QualificationStatus,
} from '@/types/scent-work-types';

// Local type for competition data
export interface LocalCompetitionData {
  time?: string;
  qualified?: boolean;
  qualification?: string;
  faults?: number;
  judgeNotes?: string;
}

export interface BulkResultEntryProps {
  classId: string;
  entries: ScentWorkEntry[];
  classConfig: ScentWorkClassConfig;
  onResultsSubmit: (results: (ScentWorkResult | MultiAreaScentWorkResult)[]) => Promise<void>;
  className?: string;
}

export interface BulkEntryData {
  entryId: string;
  armband: string;
  dogName: string;
  handlerName: string;
  searchTime: string;
  qualification: QualificationStatus | '';
  faults: string;
  notes: string;
  isValid: boolean;
  hasChanges: boolean;
}
