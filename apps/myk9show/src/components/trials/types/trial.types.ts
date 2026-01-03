export interface Trial {
  id: string;
  showId: string;
  showName: string;
  trialDate: string;
  trialNumber: string;
  status: 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled';
  image?: string;
  plannedStartTime?: string;
  timeStarted?: string;
  timeEnded?: string;
  eventNumber?: string;
  type?: string;
  order?: string;
  name?: string;
  trialType?: string;
}

export interface TrialClass {
  id: string;
  element: string;
  level: string;
  section: string;
  judgeId: string;
  judgeName?: string; // For display purposes
  startTime: string;
  status: 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled';
  entries: number;
}

export interface TrialFormData extends Omit<Trial, 'id' | 'image'> {
  tempImage?: string;
}
