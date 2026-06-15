export interface TVDogInfo {
  name: string;
  callName: string | null;
  breed: string | null;
  imageUrl: string | null;
}

export interface TVEntry {
  id: string;
  armband: string | null;
  handler: string | null;
  runOrder: number | null;
  isInRing: boolean;
  isScored: boolean;
  dog: TVDogInfo | null;
}

export interface TVClass {
  id: string;
  name: string;
  element: string | null;
  level: string | null;
  status: string | null;
  judgeName: string | null;
  totalEntries: number | null;
  scoredCount: number | null;
  startTime: string | null;
  trialDate: string | null;
  trialNumber: number | null;
  entries: TVEntry[];
}

export interface TVShowInfo {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface TVPlacement {
  placement: number;
  armband: string | null;
  handler: string | null;
  searchTime: number | null;
  totalScore: number | null;
  dog: TVDogInfo | null;
}

export interface TVCompletedClass {
  id: string;
  name: string;
  element: string | null;
  level: string | null;
  judgeName: string | null;
  totalEntries: number | null;
  qualifiedCount: number | null;
  fastestTime: number | null;
  placements: TVPlacement[];
}

export interface TVDisplayData {
  show: TVShowInfo | null;
  classes: TVClass[];
}
