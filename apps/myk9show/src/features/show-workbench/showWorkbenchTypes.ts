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
  /**
   * `null` means the entries read did not succeed, so the count is UNKNOWN.
   * Consumers must not treat it as zero: on the Show Desk these counts drive
   * the scored-progress line, the pending-attention chips and the
   * mark-complete guard, and a zero stands in for "nothing outstanding".
   */
  entryCount: number | null;
  scoredCount: number | null;
  trialDate: string;
  timezone?: string | null;
  trialNumber: string;
  trialName: string;
}
