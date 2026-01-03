import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User } from '../types/dog-types';
// import { masterMockData } from '@/services/mockDataService'; // Disabled - no mock data

// TODO: Replace with your real API endpoint
// These functions are temporarily unused during development
// const fetchPeople = async (): Promise<User[]> => {
//   const res = await fetch('/api/people');
//   if (!res.ok) throw new Error('Failed to fetch people');
//   return res.json();
// };

// const addPersonApi = async (person: User): Promise<User> => {
//   // TODO: Replace with POST to your API
//   return person;
// };

// const updatePersonApi = async (person: User): Promise<User> => {
//   // TODO: Replace with PUT/PATCH to your API
//   return person;
// };

// const deletePersonApi = async (_personId: string): Promise<void> => {
//   // TODO: Replace with DELETE to your API
//   return;
// };

// No mock data - starting with empty array per user request
let mockUsers: User[] = [];

export function useUsers() {
  return useQuery<User[]>({
    queryKey: ['people'],
    queryFn: () => new Promise(resolve => setTimeout(() => resolve([...mockUsers]), 500))
  });
}

export function useAddPerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newPerson: User): Promise<User> => {
      const addedPerson = { ...newPerson, id: Date.now().toString() };
      mockUsers = [...mockUsers, addedPerson];
      return addedPerson;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] })
  });
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (person: User): Promise<User> => {
      const index = mockUsers.findIndex(p => p.id === person.id);
      if (index !== -1) {
        mockUsers[index] = person;
      }
      return person;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] })
  });
}

export function useDeletePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string): Promise<void> => {
      mockUsers = mockUsers.filter(p => p.id !== personId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] })
  });
}
