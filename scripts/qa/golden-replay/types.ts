export interface GoldenEntry {
  armband: number;
  handler: string;
  dog: string;
  resultStatus: string;
  searchTimeSeconds: number;
  totalFaults: number;
  totalCorrectFinds: number;
  totalIncorrectFinds: number;
  area1TimeSeconds: number;
  area1Correct: number;
  area1Incorrect: number;
  area1Faults: number;
  timeOverLimit: boolean;
  pointsEarned: number;
  /** The v3 published placement; null when v3 placed nobody for this entry. */
  finalPlacement: number | null;
}

export interface GoldenClass {
  element: string;
  level: string;
  section: string;
  timeLimitSeconds: number | null;
  areaCount: number;
  entries: GoldenEntry[];
}

export interface GoldenFixture {
  source: {
    system: string;
    trialId: number;
    accessTrialId: number;
    showId: number;
    trialName: string;
    trialDate: string;
    exportedOn: string;
    anonymised: boolean;
    note: string;
    replay: string;
  };
  classes: GoldenClass[];
}
