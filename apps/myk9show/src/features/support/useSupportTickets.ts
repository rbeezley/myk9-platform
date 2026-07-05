import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listSupportTicketMessages,
  listSupportTickets,
  markSupportTicketMessagesRead,
  postSupportTicketMessage,
  updateSupportTicketStatus,
  type SupportTicketStatus,
} from './supportTickets';

export const supportTicketKeys = {
  all: ['support-tickets'] as const,
  lists: () => [...supportTicketKeys.all, 'list'] as const,
  list: (status?: SupportTicketStatus) => [...supportTicketKeys.lists(), status ?? 'all'] as const,
  messages: (ticketId: string) => [...supportTicketKeys.all, 'messages', ticketId] as const,
};

export function useSupportTickets(status?: SupportTicketStatus) {
  return useQuery({
    queryKey: supportTicketKeys.list(status),
    queryFn: () => listSupportTickets(status),
  });
}

export function useSupportTicketMessages(ticketId: string | null) {
  return useQuery({
    queryKey: supportTicketKeys.messages(ticketId ?? 'none'),
    queryFn: () => listSupportTicketMessages(ticketId!),
    enabled: !!ticketId,
  });
}

export function usePostSupportTicketMessage(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postSupportTicketMessage,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: supportTicketKeys.messages(ticketId) }),
        queryClient.invalidateQueries({ queryKey: supportTicketKeys.lists() }),
      ]);
    },
  });
}

export function useMarkSupportTicketMessagesRead(ticketId: string, readerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markSupportTicketMessagesRead(ticketId, readerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: supportTicketKeys.messages(ticketId) });
    },
  });
}

export function useUpdateSupportTicketStatus(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: SupportTicketStatus) => updateSupportTicketStatus(ticketId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: supportTicketKeys.all });
    },
  });
}
