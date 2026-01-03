import type { Achievement } from '@/types/achievement-types';

export const mockAchievements: Achievement[] = [
  {
    id: '1',
    title: 'UKC Champion',
    date: '2024-12-10',
    description: 'Completed with 100 championship points across 8 shows',
    icon: '🏆',
    color: 'bg-yellow-50',
  },
  {
    id: '2',
    title: 'Best of Breed',
    date: '2024-11-12',
    description: 'Golden State Kennel Club',
    icon: '🥇',
    color: 'bg-blue-50',
  },
  {
    id: '3',
    title: 'Novice Obedience Title',
    date: '2024-08-05',
    description: 'Completed with scores of 192, 187, and 195',
    icon: '🌟',
    color: 'bg-purple-50',
  },
];
