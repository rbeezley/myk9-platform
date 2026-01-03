import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Competition {
  id: string;
  name: string;
  date: string;
  location: string;
  status: string;
}

let mockCompetitions: Competition[] = [
  {
    id: '1',
    name: 'Spring Classic',
    date: '2024-04-15',
    location: 'San Jose, CA',
    status: 'Upcoming',
  },
  {
    id: '2',
    name: 'Summer Invitational',
    date: '2024-07-20',
    location: 'Austin, TX',
    status: 'Open',
  },
  {
    id: '3',
    name: 'Fall Nationals',
    date: '2024-10-10',
    location: 'Chicago, IL',
    status: 'Closed',
  },
];

export function useCompetitions() {
  return useQuery<Competition[]>({
    queryKey: ['competitions'],
    queryFn: () => new Promise(resolve => setTimeout(() => resolve([...mockCompetitions]), 500))
  });
}

export function useAddCompetition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newCompetition: Competition) => {
      mockCompetitions = [...mockCompetitions, { ...newCompetition, id: Date.now().toString() }];
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['competitions'] })
  });
}

export function useUpdateCompetition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updatedCompetition: Competition) => {
      mockCompetitions = mockCompetitions.map(c => c.id === updatedCompetition.id ? { ...updatedCompetition } : c);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['competitions'] })
  });
}

export function useDeleteCompetition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (competitionId: string) => {
      mockCompetitions = mockCompetitions.filter(c => c.id !== competitionId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['competitions'] })
  });
}

