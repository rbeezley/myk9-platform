import type { AKCSubmissionData } from '@myk9/secretary';

export type SubmissionHistoryRow = {
  id: string;
  show_id: string;
  trial_id: string | null;
  organization: string;
  sport_type: string;
  submitted_at: string;
  submitted_by: string | null;
  xml_payload: string | null;
  status: 'pending' | 'sent' | 'submitted' | 'failed';
};

export function makeHistoryRow(
  overrides: Partial<SubmissionHistoryRow> = {}
): SubmissionHistoryRow {
  return {
    id: 'sub-1',
    show_id: 'show-1',
    trial_id: null,
    organization: 'AKC',
    sport_type: 'scent_work',
    submitted_at: '2026-05-10T12:00:00Z',
    submitted_by: null,
    xml_payload: null,
    status: 'sent',
    ...overrides,
  };
}

function makeAKCEntry(
  overrides: Partial<AKCSubmissionData['entries'][number]> = {}
): AKCSubmissionData['entries'][number] {
  return {
    dogName: 'Fluffy',
    breed: 'X',
    registrationNumber: 'HP123',
    handlerName: '',
    className: 'N',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    resultCode: null,
    searchTimeSeconds: null,
    totalFaults: null,
    finalPlacement: null,
    armbandNumber: 101,
    trialId: 't1',
    classId: 'c1',
    dogRegisteredName: null,
    dogGender: 'B',
    ownerName: null,
    ownerAddress: null,
    timeLimitSeconds: null,
    entryStatus: 'accepted',
    checkInStatus: 'present',
    resultStatus: null,
    ...overrides,
  };
}

export function makeAKCSubmissionData({
  show = {},
  entries = [{}],
}: {
  show?: Partial<AKCSubmissionData['show']>;
  entries?: Partial<AKCSubmissionData['entries'][number]>[];
} = {}): AKCSubmissionData {
  return {
    show: {
      id: 'show-1',
      name: 'Spring',
      clubName: 'Club',
      date: null,
      clubLicenseNumber: null,
      secretaryName: 'Jane',
      secretaryEmail: 'jane@example.com',
      ...show,
    },
    trials: [],
    entries: entries.map(makeAKCEntry),
  };
}
