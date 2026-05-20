// Query key factories and cache strategies for health database hooks
import type { HealthFilters, HealthOverviewOptions } from '@/types/health';

// Query key factory
export const healthQueryKeys = {
  all: ['health'] as const,

  // Health Records
  healthRecords: () => [...healthQueryKeys.all, 'records'] as const,
  healthRecord: (id: string) => [...healthQueryKeys.healthRecords(), id] as const,
  dogHealthRecords: (dogId: string) => [...healthQueryKeys.healthRecords(), 'dog', dogId] as const,

  // Vaccinations
  vaccinations: () => [...healthQueryKeys.all, 'vaccinations'] as const,
  vaccination: (id: string) => [...healthQueryKeys.vaccinations(), id] as const,
  dogVaccinations: (dogId: string) => [...healthQueryKeys.vaccinations(), 'dog', dogId] as const,
  upcomingVaccinations: (dogId?: string) =>
    [...healthQueryKeys.vaccinations(), 'upcoming', dogId] as const,

  // Medications
  medications: () => [...healthQueryKeys.all, 'medications'] as const,
  medication: (id: string) => [...healthQueryKeys.medications(), id] as const,
  dogMedications: (dogId: string) => [...healthQueryKeys.medications(), 'dog', dogId] as const,
  activeMedications: (dogId?: string) =>
    [...healthQueryKeys.medications(), 'active', dogId] as const,

  // Allergies
  allergies: () => [...healthQueryKeys.all, 'allergies'] as const,
  allergy: (id: string) => [...healthQueryKeys.allergies(), id] as const,
  dogAllergies: (dogId: string) => [...healthQueryKeys.allergies(), 'dog', dogId] as const,
  activeAllergies: (dogId?: string) => [...healthQueryKeys.allergies(), 'active', dogId] as const,

  // Vet Visits
  vetVisits: () => [...healthQueryKeys.all, 'vet-visits'] as const,
  vetVisit: (id: string) => [...healthQueryKeys.vetVisits(), id] as const,
  dogVetVisits: (dogId: string) => [...healthQueryKeys.vetVisits(), 'dog', dogId] as const,
  followUpVisits: (dogId?: string) => [...healthQueryKeys.vetVisits(), 'follow-up', dogId] as const,

  // OFA Screenings
  ofaScreenings: () => [...healthQueryKeys.all, 'ofa-screenings'] as const,
  ofaScreening: (id: string) => [...healthQueryKeys.ofaScreenings(), id] as const,
  dogOFAScreenings: (dogId: string) => [...healthQueryKeys.ofaScreenings(), 'dog', dogId] as const,

  // Genetic Screenings
  geneticScreenings: () => [...healthQueryKeys.all, 'genetic-screenings'] as const,
  geneticScreening: (id: string) => [...healthQueryKeys.geneticScreenings(), id] as const,
  dogGeneticScreenings: (dogId: string) =>
    [...healthQueryKeys.geneticScreenings(), 'dog', dogId] as const,

  // Per-dog umbrella key — shared prefix for the synthesized overview so
  // sub-table mutations can invalidate every options-variant in one call.
  dogHealth: (dogId: string) => [...healthQueryKeys.all, 'dog', dogId] as const,
  dogHealthOverview: (dogId: string, options?: HealthOverviewOptions) =>
    [...healthQueryKeys.dogHealth(dogId), 'overview', options] as const,

  // Analytics
  healthStatistics: (dogId: string) => [...healthQueryKeys.all, 'statistics', dogId] as const,
  healthTimeline: (dogId: string, filters?: HealthFilters) =>
    [...healthQueryKeys.all, 'timeline', dogId, filters] as const,
  healthAlerts: (dogId: string) => [...healthQueryKeys.all, 'alerts', dogId] as const,
  healthSearch: (dogId: string, searchTerm: string, filters?: HealthFilters) =>
    [...healthQueryKeys.all, 'search', dogId, searchTerm, filters] as const,
};

// Cache strategies
export const healthCacheStrategies = {
  realtime: { staleTime: 0, gcTime: 1000 * 60 * 5 }, // 5 minutes cache
  moderate: { staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 10 }, // 5 min stale, 10 min cache
  stable: { staleTime: 1000 * 60 * 15, gcTime: 1000 * 60 * 30 }, // 15 min stale, 30 min cache
};
