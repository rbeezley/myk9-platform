import type { Personnel } from '@/components/templates/secretary/PersonnelManager';

/**
 * Mock personnel data for development/demo purposes.
 * In production, this would come from a personnel store or API.
 */
export const MOCK_PERSONNEL: Personnel[] = [
  {
    id: 'judge1',
    name: 'Sarah Johnson',
    email: 'sarah.j@email.com',
    phone: '(555) 123-4567',
    roles: [
      { type: 'judge', level: 'expert', elements: ['Container', 'Buried', 'Exterior', 'Interior'] }
    ],
    certifications: ['AKC Scent Work Judge', 'NACSW Judge'],
    availability: [{ start: '08:00', end: '17:00' }],
    preferences: {
      maxConsecutiveHours: 6,
      minBreakBetween: 15,
      preferredElements: ['Container', 'Interior'],
      avoidElements: [],
      canWorkWithJudges: []
    }
  },
  {
    id: 'judge2',
    name: 'Mike Davis',
    email: 'mike.d@email.com',
    phone: '(555) 234-5678',
    roles: [
      { type: 'judge', level: 'experienced', elements: ['Container', 'Buried', 'Exterior'] }
    ],
    certifications: ['AKC Scent Work Judge'],
    availability: [{ start: '09:00', end: '16:00' }],
    preferences: {
      maxConsecutiveHours: 4,
      minBreakBetween: 20,
      preferredElements: ['Exterior'],
      avoidElements: ['Interior'],
      canWorkWithJudges: []
    }
  },
  {
    id: 'steward1',
    name: 'Lisa Brown',
    email: 'lisa.b@email.com',
    phone: '(555) 345-6789',
    roles: [
      { type: 'gate-steward', level: 'experienced', elements: ['Container', 'Buried', 'Exterior', 'Interior'] },
      { type: 'table-steward', level: 'expert', elements: ['Container', 'Buried', 'Exterior', 'Interior'] }
    ],
    certifications: ['Trial Secretary', 'Steward Training'],
    availability: [{ start: '07:30', end: '18:00' }],
    preferences: {
      maxConsecutiveHours: 8,
      minBreakBetween: 10,
      preferredElements: [],
      avoidElements: [],
      canWorkWithJudges: ['judge1', 'judge2']
    }
  },
  {
    id: 'steward2',
    name: 'Tom Wilson',
    email: 'tom.w@email.com',
    phone: '(555) 456-7890',
    roles: [
      { type: 'timer', level: 'experienced', elements: ['Container', 'Buried', 'Exterior', 'Interior'] },
      { type: 'ring-steward', level: 'novice', elements: ['Container', 'Exterior'] }
    ],
    certifications: ['Timer Certification'],
    availability: [{ start: '08:00', end: '17:00' }],
    preferences: {
      maxConsecutiveHours: 6,
      minBreakBetween: 15,
      preferredElements: ['Container'],
      avoidElements: [],
      canWorkWithJudges: ['judge1', 'judge2']
    }
  }
];
