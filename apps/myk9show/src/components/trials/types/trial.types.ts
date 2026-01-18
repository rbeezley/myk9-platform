export interface Trial {
  id: string;
  showId: string;
  showName: string;
  trialDate: string;
  trialNumber: string;
  status: 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled';
  image?: string | undefined;
  plannedStartTime?: string | undefined;
  timeStarted?: string | undefined;
  timeEnded?: string | undefined;
  eventNumber?: string | undefined;
  type?: string | undefined;
  order?: string | undefined;
  name?: string | undefined;
  trialType?: string | undefined;
}

export interface TrialClass {
  id: string;
  element: string;
  level: string;
  section: string;
  judgeId: string;
  judgeName?: string | undefined; // For display purposes
  startTime: string;
  status: 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled';
  entries: number;
}

export interface TrialFormData extends Omit<Trial, 'id' | 'image'> {
  tempImage?: string | undefined;
}
