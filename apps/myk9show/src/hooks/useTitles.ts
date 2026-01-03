import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Title {
  id: string;
  dogName: string;
  title: string;
  organization: string;
  dateEarned: string;
  status: string;
}

let mockTitles: Title[] = [
  {
    id: '1',
    dogName: 'Champion Rex',
    title: 'CGC',
    organization: 'AKC',
    dateEarned: '2023-04-01',
    status: 'Awarded',
  },
  {
    id: '2',
    dogName: 'Buddy Boy',
    title: 'Rally Novice',
    organization: 'UKC',
    dateEarned: '2023-07-15',
    status: 'Pending',
  },
  {
    id: '3',
    dogName: 'Bella',
    title: 'Field Champion',
    organization: 'AKC',
    dateEarned: '2022-10-11',
    status: 'Awarded',
  },
];

export function useTitles() {
  return useQuery<Title[]>({
    queryKey: ['titles'],
    queryFn: () => new Promise(resolve => setTimeout(() => resolve([...mockTitles]), 500))
  });
}

export function useAddTitle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newTitle: Title) => {
      mockTitles = [...mockTitles, { ...newTitle, id: Date.now().toString() }];
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['titles'] })
  });
}

export function useUpdateTitle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updatedTitle: Title) => {
      mockTitles = mockTitles.map(t => t.id === updatedTitle.id ? { ...updatedTitle } : t);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['titles'] })
  });
}

export function useDeleteTitle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (titleId: string) => {
      mockTitles = mockTitles.filter(t => t.id !== titleId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['titles'] })
  });
}
