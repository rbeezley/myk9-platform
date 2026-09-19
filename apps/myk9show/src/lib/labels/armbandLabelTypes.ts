import type { PaperworkHandlerIdentity } from '@/features/show-map/cockpit/paperworkPrintState';

export type ArmbandLabelValue = number | string;

export interface ArmbandLabelEntry {
  id: string;
  dogId: string;
  trialId: string;
  classId: string;
  calendarDay: string;
  armband: ArmbandLabelValue;
  callName: string;
  handler: string;
  trialDate: string;
  isDayOfShow: boolean;
  handlerIdentity?: PaperworkHandlerIdentity | undefined;
}

export interface ArmbandLabelItem {
  armband: ArmbandLabelValue;
  callName: string;
  handler: string;
  trialDate: string;
}

export interface LabelContentConfig {
  callName: boolean;
  trialDate: boolean;
  handlerName: boolean;
  clubLogo: boolean;
  showAccessCode: boolean;
  venueWifi: boolean;
}

export interface LabelFilterConfig {
  earlyEntries: boolean;
  dayOfShowEntries: boolean;
  specificArmband?: number | null;
}

export const DEFAULT_CONTENT_CONFIG: LabelContentConfig = {
  callName: true,
  trialDate: true,
  handlerName: false,
  clubLogo: false,
  showAccessCode: true,
  venueWifi: false,
};
