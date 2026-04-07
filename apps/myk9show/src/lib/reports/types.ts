import type React from 'react';
import type { DbShow, DbTrial, DbClass, DbEntry } from '@/types/database-mappings';

export interface ReportEntry {
  id: string;
  armband: number;
  runOrder: number | null;
  callName: string;
  breed: string;
  handler: string;
  registrationNumber: string | null;
  checkInStatus: string | null;
  section: string | null;
  isScored: boolean;
  resultText: string | null;
  searchTimeSeconds: number | null;
  totalFaults: number | null;
  finalPlacement: number | null;
}

export interface ReportSortOption {
  value: string;
  label: string;
}

export interface ReportProps {
  showId?: string;
  showName: string;
  trial?: {
    date: string;
    trialNumber: string;
    judgeName: string;
  };
  classData?: {
    element: string;
    level: string;
    section: string;
    timeLimitSeconds?: number | null;
    timeLimitArea2Seconds?: number | null;
    timeLimitArea3Seconds?: number | null;
    areaCount?: number | null;
    hidesText?: string | null;
    distractionsText?: string | null;
  };
  entries: ReportEntry[];
  sortOrder: string;
  organization?: string;
  activityType?: string;
  clubName?: string;
  showDates?: string;
}

export interface ReportDefinition {
  id: string;
  name: string;
  category: string;
  scopes: ('show' | 'trial' | 'class')[];
  sortOptions: ReportSortOption[];
  defaultSort: string;
  component: React.ComponentType<ReportProps>;
  enabled: boolean;
}

export interface ReportDataSet {
  show: DbShow;
  pages: ReportPageData[];
}

export interface ReportPageData {
  trial: DbTrial;
  classData: DbClass;
  entries: DbEntry[];
}
