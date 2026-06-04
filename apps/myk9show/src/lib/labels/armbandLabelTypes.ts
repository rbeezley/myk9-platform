export interface ArmbandLabelEntry {
  id: string;
  armband: number;
  callName: string;
  handler: string;
  trialDate: string;
  isDayOfShow: boolean;
}

export interface ArmbandLabelItem {
  armband: number;
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
