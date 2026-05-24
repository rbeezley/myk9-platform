import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accessRequestService } from './accessRequestService';
import type {
  ApproveClubAccessRequestInput,
  DenyClubAccessRequestInput,
} from './accessRequestTypes';

export const accessRequestKeys = {
  all: ['access-requests'] as const,
  pending: () => [...accessRequestKeys.all, 'pending'] as const,
  mine: () => [...accessRequestKeys.all, 'mine'] as const,
};

export function usePendingAccessRequests() {
  return useQuery({
    queryKey: accessRequestKeys.pending(),
    queryFn: () => accessRequestService.listPending(),
  });
}

export function useMyAccessRequests() {
  return useQuery({
    queryKey: accessRequestKeys.mine(),
    queryFn: () => accessRequestService.listMine(),
  });
}

export function useApproveAccessRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ApproveClubAccessRequestInput) => accessRequestService.approve(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessRequestKeys.all }),
  });
}

export function useDenyAccessRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DenyClubAccessRequestInput) => accessRequestService.deny(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessRequestKeys.all }),
  });
}
