import { getPaperScoringClassHref } from '@/pages/scoring/scoringRoutes';

export type CockpitPrototypeVariant = 'scent' | 'rings' | 'offline';
export type CockpitPrototypeFilter = 'all' | 'in-progress' | 'attention' | 'closeout';
export type CockpitPrototypeStatus = 'not-started' | 'in-progress' | 'complete' | 'cancelled';
export type CockpitPrototypeTone = 'urgent' | 'warning' | 'info';
export type PaperworkPrototypeState = 'current' | 'stale' | 'unconfirmed';

export const COCKPIT_STATUS_LABELS: Record<CockpitPrototypeStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  complete: 'Complete',
  cancelled: 'Cancelled',
};

export const COCKPIT_PROTOTYPE_FILTERS: readonly {
  key: CockpitPrototypeFilter;
  label: string;
}[] = [
  { key: 'all', label: 'All' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'closeout', label: 'Needs closeout' },
];

export interface CockpitPrototypeAction {
  label: string;
  owner: string;
  destination: string;
  kind?: 'navigate' | 'print';
  documentId?: string;
}

export interface PaperworkPrototype {
  id: string;
  label: string;
  state: PaperworkPrototypeState;
  detail: string;
  history: readonly string[];
}

export interface CockpitClassPrototype {
  id: string;
  trialId: string;
  trialNumber: string;
  trialDate: string;
  time: string | null;
  revisedExpectedTime?: string | undefined;
  name: string;
  location: string | null;
  judge: string;
  status: CockpitPrototypeStatus;
  actualStartTime?: string | undefined;
  actualEndTime?: string | undefined;
  scored: number;
  total: number;
  issue?: string;
  needsCloseout?: boolean;
  primaryAction: CockpitPrototypeAction;
  supportingActions: readonly CockpitPrototypeAction[];
  paperwork: readonly PaperworkPrototype[];
}

export interface AttentionPrototype {
  id: string;
  title: string;
  detail: string;
  classId: string;
  tone: CockpitPrototypeTone;
  action: CockpitPrototypeAction;
}

export interface CockpitPrototypeScenario {
  key: CockpitPrototypeVariant;
  label: string;
  showName: string;
  day: string;
  context: string;
  syncLabel: string;
  syncMode: 'online' | 'offline';
  classes: readonly CockpitClassPrototype[];
  attention: readonly AttentionPrototype[];
}

function paperScoringAction(classId: string): CockpitPrototypeAction {
  return {
    label: 'Enter paper scores',
    owner: 'Paper Scoring',
    destination: getPaperScoringClassHref(classId),
  };
}

export function buildCockpitClassWorkActions(
  classItem: CockpitClassPrototype
): readonly CockpitPrototypeAction[] {
  return [
    {
      label: 'Entries & results',
      owner: 'Class Entries & Results',
      destination: `/shows/demo/trials/${classItem.trialId}/classes/${classItem.id}`,
    },
    {
      ...paperScoringAction(classItem.id),
      label: 'Paper score entry',
    },
    {
      label: 'Run order',
      owner: 'Class Management',
      destination: `/shows/demo/classes/${classItem.trialId}?focus=${classItem.id}&mode=run-order`,
    },
  ];
}

const scentClasses: readonly CockpitClassPrototype[] = [
  {
    id: 'buried-novice-b',
    trialId: 'trial-1',
    trialNumber: '1',
    trialDate: 'Sunday, July 19',
    time: '9:00 AM',
    name: 'Buried Novice B',
    location: 'Gym · Search Area 2',
    judge: 'Judge Morgan',
    status: 'complete',
    actualStartTime: '9:02 AM',
    actualEndTime: '9:41 AM',
    scored: 16,
    total: 16,
    needsCloseout: true,
    primaryAction: {
      label: 'Finish class',
      owner: 'Class Entries & Results',
      destination: '/shows/demo/trials/trial-1/classes/buried-novice-b',
    },
    supportingActions: [
      {
        label: 'Open Result Labels',
        owner: 'Reports',
        destination: '/shows/demo/reports?report=result-labels&scope=class:buried-novice-b',
      },
    ],
    paperwork: [
      {
        id: 'result-labels',
        label: 'Result Labels',
        state: 'unconfirmed',
        detail: 'Not confirmed printed',
        history: [],
      },
    ],
  },
  {
    id: 'interior-advanced',
    trialId: 'trial-1',
    trialNumber: '1',
    trialDate: 'Sunday, July 19',
    time: '10:00 AM',
    name: 'Interior Advanced',
    location: 'Kitchen · Search Area 1',
    judge: 'Judge Lee',
    status: 'in-progress',
    actualStartTime: '10:07 AM',
    scored: 10,
    total: 12,
    issue: '2 paper scores still need entry',
    primaryAction: paperScoringAction('interior-advanced'),
    supportingActions: [],
    paperwork: [
      {
        id: 'score-sheets',
        label: 'Score sheets',
        state: 'current',
        detail: 'Printed 9:42 AM by Jamie · Class scope',
        history: ['9:42 AM · Jamie · Class print'],
      },
      {
        id: 'check-in-sheet',
        label: 'Check-in sheet',
        state: 'stale',
        detail: 'Printed with AM Trial at 8:07 AM by Alex · one move-up changed afterward',
        history: ['8:07 AM · Alex · AM Trial print'],
      },
    ],
  },
  {
    id: 'container-novice-a',
    trialId: 'trial-1',
    trialNumber: '1',
    trialDate: 'Sunday, July 19',
    time: '10:30 AM',
    revisedExpectedTime: '10:48 AM',
    name: 'Container Novice A',
    location: 'Gym · Search Area 1',
    judge: 'Judge Patel',
    status: 'not-started',
    scored: 0,
    total: 18,
    issue: 'Move-up needs review',
    primaryAction: {
      label: 'Review move-up',
      owner: 'Entry Management',
      destination: '/shows/demo/entry-management?class=container-novice-a&attention=move-up',
    },
    supportingActions: [
      {
        label: 'Review run order',
        owner: 'Class Management',
        destination: '/shows/demo/classes/trial-1?focus=container-novice-a&mode=run-order',
      },
    ],
    paperwork: [
      {
        id: 'check-in-sheet',
        label: 'Check-in sheet',
        state: 'unconfirmed',
        detail: 'Not confirmed printed · starts in 18 minutes',
        history: [],
      },
      {
        id: 'score-sheets',
        label: 'Score sheets',
        state: 'unconfirmed',
        detail: 'Not confirmed printed',
        history: [],
      },
    ],
  },
  {
    id: 'exterior-excellent',
    trialId: 'trial-2',
    trialNumber: '2',
    trialDate: 'Sunday, July 19',
    time: '11:15 AM',
    name: 'Exterior Excellent',
    location: 'Courtyard + east lawn · 2 Search Areas',
    judge: 'Judge Morgan',
    status: 'complete',
    actualStartTime: '11:18 AM',
    actualEndTime: '11:56 AM',
    scored: 14,
    total: 14,
    needsCloseout: true,
    issue: 'Result Labels changed after printing',
    primaryAction: {
      label: 'Review and reprint',
      owner: 'Reports',
      destination: '/shows/demo/reports?report=result-labels&scope=class:exterior-excellent',
      kind: 'print',
      documentId: 'result-labels',
    },
    supportingActions: [],
    paperwork: [
      {
        id: 'result-labels',
        label: 'Result Labels',
        state: 'stale',
        detail: 'Printed 10:14 AM by Jamie · results changed afterward',
        history: ['10:14 AM · Jamie · Class print'],
      },
    ],
  },
  {
    id: 'interior-novice-b',
    trialId: 'trial-2',
    trialNumber: '2',
    trialDate: 'Sunday, July 19',
    time: null,
    name: 'Interior Novice B',
    location: 'Storage room · Search Area 1',
    judge: 'Judge Lee',
    status: 'not-started',
    scored: 0,
    total: 12,
    primaryAction: {
      label: 'Print check-in sheet',
      owner: 'Reports',
      destination: '/shows/demo/reports?report=check-in&scope=class:interior-novice-b',
      kind: 'print',
      documentId: 'check-in-sheet',
    },
    supportingActions: [],
    paperwork: [
      {
        id: 'check-in-sheet',
        label: 'Check-in sheet',
        state: 'unconfirmed',
        detail: 'Not confirmed printed',
        history: [],
      },
    ],
  },
];

const ringsClasses: readonly CockpitClassPrototype[] = [
  {
    ...scentClasses[0],
    id: 'novice-a',
    name: 'Novice A',
    trialDate: 'Saturday, July 25',
    location: 'Ring 3',
    judge: 'Judge Warren',
  },
  {
    ...scentClasses[1],
    id: 'open-a',
    name: 'Open A',
    trialDate: 'Saturday, July 25',
    time: '9:30 AM',
    location: 'Ring 1',
    judge: 'Judge Chen',
    scored: 14,
    total: 17,
    issue: '3 paper scores still need entry',
    primaryAction: paperScoringAction('open-a'),
  },
  {
    ...scentClasses[2],
    id: 'utility-b',
    name: 'Utility B',
    trialDate: 'Saturday, July 25',
    time: '10:15 AM',
    location: 'Ring 2',
    judge: 'Judge Rivera',
    issue: 'Judge assignment conflict',
  },
  {
    ...scentClasses[4],
    id: 'graduate-novice',
    name: 'Graduate Novice',
    trialDate: 'Saturday, July 25',
    time: '11:00 AM',
    location: null,
    judge: 'Judge Kim',
  },
];

const scentAttention: readonly AttentionPrototype[] = [
  {
    id: 'move-up',
    title: 'Move-up needs review',
    detail: 'Container Novice A · starts in 18 min',
    classId: 'container-novice-a',
    tone: 'urgent',
    action: scentClasses[2].primaryAction,
  },
  {
    id: 'scores',
    title: 'Two scores still missing',
    detail: 'Interior Advanced · class in progress',
    classId: 'interior-advanced',
    tone: 'warning',
    action: scentClasses[1].primaryAction,
  },
  {
    id: 'labels',
    title: 'Results changed after labels printed',
    detail: 'Exterior Excellent · printed 10:14 AM by Jamie',
    classId: 'exterior-excellent',
    tone: 'info',
    action: scentClasses[3].primaryAction,
  },
  {
    id: 'closeout',
    title: 'Judge signature needs review',
    detail: 'Buried Novice B · class complete',
    classId: 'buried-novice-b',
    tone: 'info',
    action: scentClasses[0].primaryAction,
  },
  {
    id: 'paperwork',
    title: 'Check-in sheet not confirmed printed',
    detail: 'Interior Novice B · next untimed class',
    classId: 'interior-novice-b',
    tone: 'info',
    action: scentClasses[4].primaryAction,
  },
];

export const COCKPIT_PROTOTYPE_SCENARIOS: Record<
  CockpitPrototypeVariant,
  CockpitPrototypeScenario
> = {
  scent: {
    key: 'scent',
    label: 'Scent work',
    showName: 'Blue Ridge Scent Work Weekend',
    day: 'Sunday, July 19',
    context: '2 trials · 5 classes today',
    syncLabel: 'Up to date',
    syncMode: 'online',
    classes: scentClasses,
    attention: scentAttention,
  },
  rings: {
    key: 'rings',
    label: 'Numbered rings',
    showName: 'Heartland Obedience Trial',
    day: 'Saturday, July 25',
    context: '2 trials · 4 classes shown',
    syncLabel: 'Up to date',
    syncMode: 'online',
    classes: ringsClasses,
    attention: [
      {
        id: 'ring-conflict',
        title: 'Ring 2 conflict',
        detail: 'Utility B · judge assignment overlaps at 10:15',
        classId: 'utility-b',
        tone: 'urgent',
        action: ringsClasses[2].primaryAction,
      },
      {
        id: 'ring-scores',
        title: 'Three scores need entry',
        detail: 'Open A · Ring 1 · in progress',
        classId: 'open-a',
        tone: 'warning',
        action: ringsClasses[1].primaryAction,
      },
      {
        id: 'ring-results',
        title: 'Class results ready',
        detail: 'Novice A · Ring 3 · judge signed',
        classId: 'novice-a',
        tone: 'info',
        action: ringsClasses[0].primaryAction,
      },
    ],
  },
  offline: {
    key: 'offline',
    label: 'Offline coordination',
    showName: 'Blue Ridge Scent Work Weekend',
    day: 'Sunday, July 19',
    context: '2 trials · two secretaries working',
    syncLabel: 'Saved on this device',
    syncMode: 'offline',
    classes: scentClasses,
    attention: scentAttention,
  },
};

export const COCKPIT_PROTOTYPE_VARIANTS: readonly CockpitPrototypeVariant[] = [
  'scent',
  'rings',
  'offline',
];
