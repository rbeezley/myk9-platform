import type { PastResult } from '@/types/results-types';

export const mockPastResults: PastResult[] = [
  {
    id: '1',
    showName: 'Golden State Kennel Club',
    date: '2024-11-12',
    judge: '',
    className: 'Open',
    placement: '1st Place',
    notes: '',
    points: 3,
    source: 'myK9Show',
  },
  {
    id: '2',
    showName: 'Pacific Northwest Beagle Specialty',
    date: '2024-09-05',
    judge: '',
    className: 'Open',
    placement: '2nd Place',
    notes: '',
    points: 2,
    source: 'external',
  },
  {
    id: '3',
    showName: 'Mountain View Kennel Club',
    date: '2024-07-22',
    judge: '',
    className: 'Open',
    placement: '3rd Place',
    notes: '',
    points: 1,
    source: 'external',
  },
];
