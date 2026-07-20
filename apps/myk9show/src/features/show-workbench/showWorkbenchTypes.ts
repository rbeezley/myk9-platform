export interface ShowWorkbenchClassSummary {
  id: string;
  name: string;
  element: string;
  level: string;
  section: string;
  judgeName: string;
  trialId: string;
  time: string;
  revisedExpectedStart?: string | null;
  actualStartTime?: string | undefined;
  actualFinishTime?: string | undefined;
  displayOrder?: number | undefined;
  status: string;
  entryCount: number;
  scoredCount: number;
  trialDate: string;
  timezone?: string | null;
  trialNumber: string;
  trialName: string;
}
