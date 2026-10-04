import type { FieldLocation } from './usePanelValidationNavigation';

export type ClassTabValue = 'basic' | 'timing' | 'officials' | 'requirements';

const at = (tab: ClassTabValue, elementId: string): FieldLocation<ClassTabValue> => ({
  tab,
  elementId,
});

/** Which Edit Class tab renders each schema field (MYK9-931, H4). */
const FIELD_LOCATION: Record<string, FieldLocation<ClassTabValue>> = {
  element: at('basic', 'element'),
  level: at('basic', 'level'),
  section: at('basic', 'section'),
  classOrder: at('basic', 'classOrder'),
  status: at('basic', 'classStatus'),
  estimatedJudgingTime: at('timing', 'estimatedJudgingTime'),
  timeLimit1: at('timing', 'timeLimit1'),
  timeLimit2: at('timing', 'timeLimit2'),
  timeLimit3: at('timing', 'timeLimit3'),
  judge: at('officials', 'judgeId'),
  judgeId: at('officials', 'judgeId'),
  gateSteward: at('officials', 'gateSteward'),
  tableSteward: at('officials', 'tableSteward'),
  timerSteward: at('officials', 'timerSteward'),
  ringSteward1: at('officials', 'ringSteward1'),
  ringSteward2: at('officials', 'ringSteward2'),
  ringSteward3: at('officials', 'ringSteward3'),
  hidesUsed: at('requirements', 'hidesUsed'),
  distractionsUsed: at('requirements', 'distractionsUsed'),
  itemsUsed: at('requirements', 'itemsUsed'),
  maxEntries: at('basic', 'maxEntries'),
  allowsWaitlist: at('basic', 'allowsWaitlist'),
  preEntryFee: at('requirements', 'preEntryFee'),
  dayOfShowFee: at('requirements', 'dayOfShowFee'),
};

export const locateClassField = (field: string): FieldLocation<ClassTabValue> | undefined =>
  FIELD_LOCATION[field];
