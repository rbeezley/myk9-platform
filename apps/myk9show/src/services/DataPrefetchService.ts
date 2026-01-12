import { QueryClient } from '@tanstack/react-query';
import { logger } from '@/services/LoggingService';

/**
 * Service for managing data prefetching strategies
 */
export class DataPrefetchService {
  private queryClient: QueryClient;
  private prefetchQueue: Set<string> = new Set();
  private prefetchStrategies: Map<string, PrefetchStrategy> = new Map();

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
    this.initializeDefaultStrategies();
  }

  /**
   * Initialize default prefetch strategies for common user flows
   */
  private initializeDefaultStrategies() {
    // When user views dog list, prefetch first few dog details
    this.addStrategy('dogList', {
      triggers: ['dogs'],
      actions: async (data: unknown) => {
        const dataArray = data as { id: string }[];
        const firstFewDogs = dataArray.slice(0, 5);
        await Promise.all(
          firstFewDogs.map(dog => 
            this.prefetchDogDetails(dog.id)
          )
        );
      },
      priority: 'high',
      delay: 500,
    });

    // When user views show details, prefetch related data
    this.addStrategy('showDetails', {
      triggers: ['show'],
      actions: async (show: unknown) => {
        const showData = show as { id: string; clubId: string };
        await Promise.all([
          this.prefetchShowClasses(showData.id),
          this.prefetchShowEntries(showData.id),
          this.prefetchClubDetails(showData.clubId),
        ]);
      },
      priority: 'high',
      delay: 200,
    });

    // When user views person details, prefetch their dogs
    this.addStrategy('personDetails', {
      triggers: ['person'],
      actions: async (person: unknown) => {
        const personData = person as { dogs?: { id: string }[] };
        if (personData.dogs?.length) {
          await Promise.all(
            personData.dogs.map((dog) => 
              this.prefetchDogDetails(dog.id)
            )
          );
        }
      },
      priority: 'medium',
      delay: 300,
    });

    // Navigation prefetch: when user hovers over navigation items
    this.addStrategy('navigation', {
      triggers: ['nav-hover'],
      actions: async (data: unknown) => {
        const route = data as string;
        switch (route) {
          case '/dogs':
            await this.prefetchDogList();
            break;
          case '/people':
            await this.prefetchPeopleList();
            break;
          case '/shows':
            await this.prefetchShowList();
            break;
          case '/admin':
            await this.prefetchAdminData();
            break;
        }
      },
      priority: 'low',
      delay: 100,
    });
  }

  /**
   * Add a custom prefetch strategy
   */
  addStrategy(name: string, strategy: PrefetchStrategy) {
    this.prefetchStrategies.set(name, strategy);
  }

  /**
   * Execute a prefetch strategy
   */
  async executePrefetch(strategyName: string, data: unknown) {
    const strategy = this.prefetchStrategies.get(strategyName);
    if (!strategy) return;

    const prefetchKey = `${strategyName}:${JSON.stringify(data)}`;
    
    // Avoid duplicate prefetches
    if (this.prefetchQueue.has(prefetchKey)) return;
    
    this.prefetchQueue.add(prefetchKey);

    try {
      if (strategy.delay) {
        await new Promise(resolve => setTimeout(resolve, strategy.delay));
      }

      await strategy.actions(data);
    } catch (error) {
      logger.warn(`Prefetch strategy ${strategyName} failed:`, 'services', {}, error as Error);
    } finally {
      this.prefetchQueue.delete(prefetchKey);
    }
  }

  /**
   * Prefetch dog details and related data
   */
  private async prefetchDogDetails(dogId: string) {
    const queries = [
      {
        queryKey: ['dog', dogId],
        queryFn: () => this.mockApi(`/api/dogs/${dogId}`),
      },
      {
        queryKey: ['dog', dogId, 'health-records'],
        queryFn: () => this.mockApi(`/api/dogs/${dogId}/health-records`),
      },
      {
        queryKey: ['dog', dogId, 'registrations'],
        queryFn: () => this.mockApi(`/api/dogs/${dogId}/registrations`),
      },
      {
        queryKey: ['dog', dogId, 'competitions'],
        queryFn: () => this.mockApi(`/api/dogs/${dogId}/competitions`),
      },
    ];

    await Promise.all(
      queries.map(query => 
        this.queryClient.prefetchQuery({
          ...query,
          staleTime: 5 * 60 * 1000, // 5 minutes
          gcTime: 10 * 60 * 1000, // 10 minutes
        })
      )
    );
  }

  /**
   * Prefetch show classes and entries
   */
  private async prefetchShowClasses(showId: string) {
    return this.queryClient.prefetchQuery({
      queryKey: ['show', showId, 'classes'],
      queryFn: () => this.mockApi(`/api/shows/${showId}/classes`),
      staleTime: 2 * 60 * 1000, // 2 minutes (classes can change frequently)
    });
  }

  /**
   * Prefetch show entries
   */
  private async prefetchShowEntries(showId: string) {
    return this.queryClient.prefetchQuery({
      queryKey: ['show', showId, 'entries'],
      queryFn: () => this.mockApi(`/api/shows/${showId}/entries`),
      staleTime: 1 * 60 * 1000, // 1 minute (entries change frequently)
    });
  }

  /**
   * Prefetch club details
   */
  private async prefetchClubDetails(clubId: string) {
    return this.queryClient.prefetchQuery({
      queryKey: ['club', clubId],
      queryFn: () => this.mockApi(`/api/clubs/${clubId}`),
      staleTime: 30 * 60 * 1000, // 30 minutes (club data rarely changes)
    });
  }

  /**
   * Prefetch dog list
   */
  private async prefetchDogList() {
    return this.queryClient.prefetchQuery({
      queryKey: ['dogs'],
      queryFn: () => this.mockApi('/api/dogs'),
      staleTime: 5 * 60 * 1000,
    });
  }

  /**
   * Prefetch people list
   */
  private async prefetchPeopleList() {
    return this.queryClient.prefetchQuery({
      queryKey: ['people'],
      queryFn: () => this.mockApi('/api/people'),
      staleTime: 5 * 60 * 1000,
    });
  }

  /**
   * Prefetch show list
   */
  private async prefetchShowList() {
    return this.queryClient.prefetchQuery({
      queryKey: ['shows'],
      queryFn: () => this.mockApi('/api/shows'),
      staleTime: 2 * 60 * 1000,
    });
  }

  /**
   * Prefetch admin dashboard data
   */
  private async prefetchAdminData() {
    const queries = [
      {
        queryKey: ['admin', 'stats'],
        queryFn: () => this.mockApi('/api/admin/stats'),
      },
      {
        queryKey: ['admin', 'recent-activity'],
        queryFn: () => this.mockApi('/api/admin/recent-activity'),
      },
      {
        queryKey: ['admin', 'system-health'],
        queryFn: () => this.mockApi('/api/admin/system-health'),
      },
    ];

    await Promise.all(
      queries.map(query => 
        this.queryClient.prefetchQuery({
          ...query,
          staleTime: 1 * 60 * 1000, // 1 minute for admin data
        })
      )
    );
  }

  /**
   * Intelligent prefetch based on user behavior patterns
   */
  async intelligentPrefetch(userAction: string, context: unknown) {
    const patterns = {
      // If user often goes from dog list to dog details
      'view-dog-list': () => this.executePrefetch('dogList', context),
      
      // If user views show, they often check entries
      'view-show-details': () => this.executePrefetch('showDetails', context),
      
      // If user views person, they often check their dogs
      'view-person-details': () => this.executePrefetch('personDetails', context),
      
      // Navigation patterns
      'hover-nav-dogs': () => this.executePrefetch('navigation', '/dogs'),
      'hover-nav-shows': () => this.executePrefetch('navigation', '/shows'),
      'hover-nav-people': () => this.executePrefetch('navigation', '/people'),
      'hover-nav-admin': () => this.executePrefetch('navigation', '/admin'),
    };

    const prefetchAction = patterns[userAction as keyof typeof patterns];
    if (prefetchAction) {
      await prefetchAction();
    }
  }

  /**
   * Mock API function for development
   * In production, this would be replaced with actual API calls
   */
  private async mockApi(url: string): Promise<unknown> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    // Return mock data based on URL pattern
    if (url.includes('/dogs/')) {
      return { id: '1', name: 'Max', breed: 'Golden Retriever' };
    }
    if (url.includes('/shows/')) {
      return { id: '1', name: 'Spring Dog Show 2024' };
    }
    if (url.includes('/people/')) {
      return { id: '1', name: 'John Smith' };
    }
    
    return { data: 'mock data' };
  }

  /**
   * Clear prefetch queue and strategies (for testing)
   */
  reset() {
    this.prefetchQueue.clear();
    this.prefetchStrategies.clear();
    this.initializeDefaultStrategies();
  }

  /**
   * Get prefetch statistics
   */
  getStats() {
    return {
      queueSize: this.prefetchQueue.size,
      strategiesCount: this.prefetchStrategies.size,
      cacheSize: this.queryClient.getQueryCache().getAll().length,
    };
  }
}

interface PrefetchStrategy {
  triggers: string[];
  actions: (data: unknown) => Promise<void>;
  priority: 'high' | 'medium' | 'low';
  delay?: number;
}

// Export singleton instance
let dataPrefetchService: DataPrefetchService;

export const initializeDataPrefetchService = (queryClient: QueryClient) => {
  dataPrefetchService = new DataPrefetchService(queryClient);
  return dataPrefetchService;
};

export const getDataPrefetchService = () => {
  if (!dataPrefetchService) {
    throw new Error('DataPrefetchService not initialized. Call initializeDataPrefetchService first.');
  }
  return dataPrefetchService;
};

export default DataPrefetchService;