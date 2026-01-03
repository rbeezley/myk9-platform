import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dog } from '@/types/dog-types';
// import { masterMockData } from '@/services/mockDataService'; // Disabled - no mock data

// No mock data - starting with empty array per user request
let mockDogs: Dog[] = [];

export function useDogs() {
  return useQuery<Dog[]>({ 
    queryKey: ['dogs'], 
    queryFn: () => 
      new Promise(resolve => setTimeout(() => resolve([...mockDogs]), 500))
  });
}

export function useDog(dogId: string) {
  return useQuery<Dog>({
    queryKey: ['dog', dogId],
    queryFn: () =>
      new Promise((resolve, reject) =>
        setTimeout(() => {
          const foundDog = mockDogs.find(dog => dog.id === dogId);
          if (foundDog) {
            resolve(foundDog);
          } else {
            reject(new Error(`Dog with ID ${dogId} not found`));
          }
        }, 500)
      ),
    enabled: !!dogId,
  });
}

export function useAddDog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newDog: Dog) => {
      mockDogs = [...mockDogs, { ...newDog, id: Date.now().toString() }];
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dogs'] })
  });
}

export function useUpdateDog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updatedDog: Dog) => {
      mockDogs = mockDogs.map(dog => (dog.id === updatedDog.id ? updatedDog : dog));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dogs'] })
  });
}

export function useDeleteDog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dogId: string) => {
      mockDogs = mockDogs.filter(dog => dog.id !== dogId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dogs'] })
  });
}
