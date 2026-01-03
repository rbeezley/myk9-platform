import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Registration } from '@/types/dog-types';

let mockRegistrations: Registration[] = [
  {
    id: '1',
    organization: 'AKC',
    registeredName: 'Champion Rex',
    breed: 'Beagle',
    variety: '',
    registrationNumber: 'AKC12345',
    status: 'Active',
    applicationNumber: 'APP123',
    submissionDate: '2023-01-10',
    registrationDate: '2023-02-01',
    certificate: 'cert1.pdf',
  },
  {
    id: '2',
    organization: 'UKC',
    registeredName: 'Buddy Boy',
    breed: 'Beagle',
    variety: 'Pocket',
    registrationNumber: 'UKC54321',
    status: 'Pending',
    applicationNumber: 'APP456',
    submissionDate: '2023-02-14',
    registrationDate: '2023-03-01',
    certificate: '',
  },
];

export function useRegistrations() {
  return useQuery<Registration[]>({
    queryKey: ['registrations'],
    queryFn: () => new Promise(resolve => setTimeout(() => resolve([...mockRegistrations]), 500))
  });
}

export function useAddRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newRegistration: Registration) => {
      mockRegistrations = [...mockRegistrations, { ...newRegistration, id: Date.now().toString() }];
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['registrations'] })
  });
}

export function useUpdateRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updatedRegistration: Registration) => {
      mockRegistrations = mockRegistrations.map(r => r.id === updatedRegistration.id ? { ...updatedRegistration } : r);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['registrations'] })
  });
}

export function useDeleteRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (registrationId: string) => {
      mockRegistrations = mockRegistrations.filter(r => r.id !== registrationId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['registrations'] })
  });
}


