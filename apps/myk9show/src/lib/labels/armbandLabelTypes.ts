import type { ArmbandRange } from './armbandSelection';

export interface ArmbandLabelEntry {
  id: string;
  dogId: string;
  trialId: string;
  classId: string;
  calendarDay: string;
  armband: number;
  callName: string;
  /** Breed on the dog's registration with this trial's registry; blank when it has none. */
  breed: string;
  handler: string;
  trialDate: string;
  isDayOfShow: boolean;
}

export interface ArmbandLabelItem {
  armband: number;
  callName: string;
  breed: string;
  handler: string;
  trialDate: string;
}

export interface LabelContentConfig {
  callName: boolean;
  breed: boolean;
  trialDate: boolean;
  handlerName: boolean;
  clubLogo: boolean;
  showAccessCode: boolean;
  venueWifi: boolean;
}

export interface LabelFilterConfig {
  earlyEntries: boolean;
  dayOfShowEntries: boolean;
  /** Only these armbands (`101, 105-110`); null prints every armband the other filters allow. */
  specificArmbands?: readonly ArmbandRange[] | null;
}

export const DEFAULT_CONTENT_CONFIG: LabelContentConfig = {
  callName: true,
  breed: true,
  trialDate: true,
  handlerName: true,
  clubLogo: false,
  showAccessCode: true,
  venueWifi: false,
};
