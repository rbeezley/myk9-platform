import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { Show } from '@/types/show-types';
import { mockShows } from '@/mockData/mockShows';

// Mock service implementation
const ShowsService = {
  getAll: async (): Promise<Show[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [...mockShows];
  },
  getById: async (id: string): Promise<Show | null> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return mockShows.find(show => show.id === id) || null;
  },
  getByDateRange: async (startDate: string, endDate: string): Promise<Show[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockShows.filter(show => 
      new Date(show.startDate) >= new Date(startDate) &&
      new Date(show.endDate) <= new Date(endDate)
    );
  },
  getByClub: async (clubId: string): Promise<Show[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockShows.filter(show => show.clubId === clubId);
  },
  getByStatus: async (status: string): Promise<Show[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockShows.filter(show => show.status === status);
  },
  getUpcoming: async (): Promise<Show[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const now = new Date();
    return mockShows.filter(show => new Date(show.startDate) > now);
  },
  getWithFilters: async (filters: Record<string, unknown>): Promise<Show[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    let result = [...mockShows];
    
    if (filters.type) {
      result = result.filter(show => show.type === filters.type);
    }
    if (filters.location && typeof filters.location === 'string') {
      result = result.filter(show => show.location.toLowerCase().includes((filters.location as string).toLowerCase()));
    }
    if (filters.status) {
      result = result.filter(show => show.status === filters.status);
    }
    
    return result;
  },
  create: async (show: Omit<Show, 'id'>): Promise<Show> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const newShow = { ...show, id: Date.now().toString() };
    return newShow;
  },
  update: async (id: string, updates: Partial<Show>): Promise<Show> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    const show = mockShows.find(s => s.id === id);
    if (!show) throw new Error('Show not found');
    return { ...show, ...updates };
  },
  delete: async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    // Mock deletion - in real app would remove from backend
  },
};

// Query hooks
export function useShowsQuery() {
  return useQuery({
    queryKey: queryKeys.shows,
    queryFn: ShowsService.getAll,
  });
}

export function useShowQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.show(id),
    queryFn: () => ShowsService.getById(id),
    enabled: !!id,
  });
}

export function useShowsByDateRangeQuery(startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.showsByDateRange(startDate, endDate),
    queryFn: () => ShowsService.getByDateRange(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

export function useShowsByClubQuery(clubId: string) {
  return useQuery({
    queryKey: queryKeys.showsByClub(clubId),
    queryFn: () => ShowsService.getByClub(clubId),
    enabled: !!clubId,
  });
}

export function useShowsByStatusQuery(status: string) {
  return useQuery({
    queryKey: queryKeys.showsByStatus(status),
    queryFn: () => ShowsService.getByStatus(status),
    enabled: !!status,
  });
}

export function useUpcomingShowsQuery() {
  return useQuery({
    queryKey: queryKeys.upcomingShows,
    queryFn: ShowsService.getUpcoming,
  });
}

export function useShowsWithFiltersQuery(filters: {
  type?: string;
  location?: string;
  dateRange?: { start: string; end: string };
  status?: string;
}) {
  return useQuery({
    queryKey: queryKeys.showsWithFilters(filters),
    queryFn: () => ShowsService.getWithFilters(filters),
    enabled: Object.keys(filters).length > 0,
  });
}

// Mutation hooks
export function useCreateShowMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ShowsService.create,
    onSuccess: (newShow) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows });
      queryClient.invalidateQueries({ queryKey: queryKeys.upcomingShows });
      
      queryClient.setQueryData(queryKeys.shows, (oldData: Show[] | undefined) => {
        if (!oldData) return [newShow];
        return [...oldData, newShow];
      });
    },
  });
}

export function useUpdateShowMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Show> }) =>
      ShowsService.update(id, updates),
    onSuccess: (updatedShow: Show) => {
      queryClient.setQueryData(queryKeys.show(updatedShow.id), updatedShow);
      
      queryClient.setQueryData(queryKeys.shows, (oldData: Show[] | undefined) => {
        if (!oldData) return [updatedShow];
        return oldData.map(show => show.id === updatedShow.id ? updatedShow : show);
      });
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.upcomingShows });
      queryClient.invalidateQueries({ queryKey: queryKeys.showsByClub(updatedShow.clubId) });
    },
  });
}

export function useDeleteShowMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => ShowsService.delete(),
    onSuccess: (_, deletedId: string) => {
      queryClient.removeQueries({ queryKey: queryKeys.show(deletedId) });
      
      queryClient.setQueryData(queryKeys.shows, (oldData: Show[] | undefined) => {
        if (!oldData) return [];
        return oldData.filter(show => show.id !== deletedId);
      });
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.upcomingShows });
    },
  });
}

// Optimistic update hooks
export function useOptimisticUpdateShow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Show> }) =>
      ShowsService.update(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.show(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.shows });

      const previousShow = queryClient.getQueryData(queryKeys.show(id));
      const previousShows = queryClient.getQueryData(queryKeys.shows);

      if (previousShow) {
        const optimisticShow = { ...previousShow as Show, ...updates };
        queryClient.setQueryData(queryKeys.show(id), optimisticShow);
        
        queryClient.setQueryData(queryKeys.shows, (oldData: Show[] | undefined) => {
          if (!oldData) return [optimisticShow];
          return oldData.map(show => show.id === id ? optimisticShow : show);
        });
      }

      return { previousShow, previousShows };
    },
    onError: (err, variables, context) => {
      if (context?.previousShow) {
        queryClient.setQueryData(queryKeys.show(variables.id), context.previousShow);
      }
      if (context?.previousShows) {
        queryClient.setQueryData(queryKeys.shows, context.previousShows);
      }
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.show(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.shows });
      queryClient.invalidateQueries({ queryKey: queryKeys.upcomingShows });
    },
  });
}