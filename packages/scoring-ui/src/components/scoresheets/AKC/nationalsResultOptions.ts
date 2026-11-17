import { resultLabel } from '../../../utils/resultLabel';
import { DQ_ACTIVE_CLASS } from '../../DisqualifyReason';
import type { ExtendedResult } from '../../../types/scoreData';

export const QUALIFYING_OPTIONS: { value: ExtendedResult; label: string; activeClass: string }[] = [
  {
    value: 'Q',
    label: resultLabel('Q'),
    activeClass: 'bg-green-600 hover:bg-green-700 border-green-600',
  },
  {
    value: 'NQ',
    label: resultLabel('NQ'),
    activeClass: 'bg-amber-500 hover:bg-amber-600 border-amber-500',
  },
  {
    value: 'ABS',
    label: resultLabel('ABS'),
    activeClass: 'bg-gray-500 hover:bg-gray-600 border-gray-500',
  },
  {
    value: 'EX',
    label: resultLabel('EX'),
    activeClass: 'bg-red-600 hover:bg-red-700 border-red-600',
  },
  { value: 'DQ', label: resultLabel('DQ'), activeClass: DQ_ACTIVE_CLASS },
];
