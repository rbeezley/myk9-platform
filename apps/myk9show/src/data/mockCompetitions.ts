import { Competition } from '@/types/competition-types';

export const mockCompetitions: Competition[] = [
  {
    id: '1',
    name: 'Spring Classic',
    date: '2025-05-15',
    location: 'Austin, TX',
    status: 'Upcoming',
    dogId: 'dog-1',
  },
  {
    id: '2',
    name: 'Lone Star Invitational',
    date: '2025-04-10',
    location: 'Dallas, TX',
    status: 'Completed',
    dogId: 'dog-1',
  },
  {
    id: '3',
    name: 'River City Challenge',
    date: '2025-03-05',
    location: 'San Antonio, TX',
    status: 'Completed',
    dogId: 'dog-2',
  },
];
