/**
 * Helper functions for the PredictiveLoader service
 */

import { useUserStore } from '@/store/userStore';
import type { ShowEntryPrediction } from './PredictiveLoader.types';

/**
 * Estimate the size of loading a route (in KB)
 */
export function estimateRouteSize(route: string): number {
  if (route.includes('/dogs')) return 5;
  if (route.includes('/people')) return 3;
  if (route.includes('/shows')) return 10;
  if (route.includes('/clubs')) return 2;
  return 1;
}

/**
 * Estimate entity size by type (in KB)
 */
export function estimateEntitySize(entityType: string): number {
  const sizes: Record<string, number> = {
    person: 3,
    dog: 5,
    show: 10,
    club: 2,
    entry: 1,
  };
  return sizes[entityType] || 1;
}

/**
 * Predict likely classes for a dog in a show based on sex and age
 */
export function predictLikelyClasses(dog: { sex?: string; dateOfBirth?: string }): string[] {
  const classes: string[] = [];

  if (dog.sex === 'male') {
    classes.push('Open Dogs');
  } else {
    classes.push('Open Bitches');
  }

  if (dog.dateOfBirth) {
    const age = new Date().getFullYear() - new Date(dog.dateOfBirth).getFullYear();
    if (age < 2) {
      classes.push(dog.sex === 'male' ? 'Puppy Dogs' : 'Puppy Bitches');
    }
  }

  return classes.slice(0, 3);
}

/**
 * Predict entry for a specific dog and show combination
 */
export function predictEntryForDogAndShow(
  dog: {
    id: string;
    name: string;
    breed?: string | undefined;
    ownerId?: string | undefined;
    isActive?: boolean | undefined;
    sex?: string | undefined;
    dateOfBirth?: string | undefined;
  },
  show: {
    id: string;
    name: string;
    organization?: string | undefined;
    location?: string | undefined;
  }
): ShowEntryPrediction | null {
  const reasoning: string[] = [];
  let confidence = 0.1;

  // Check if dog's breed matches show types
  if (show.organization && dog.breed) {
    if (
      show.organization.toLowerCase().includes('all breed') ||
      show.organization.toLowerCase().includes(dog.breed.toLowerCase())
    ) {
      confidence += 0.3;
      reasoning.push('Breed matches show type');
    }
  }

  // Check geographic proximity
  if (show.location && dog.ownerId) {
    const ownerLocation = useUserStore.getState().people.find(p => p.id === dog.ownerId)?.city;
    if (ownerLocation && show.location.includes(ownerLocation)) {
      confidence += 0.4;
      reasoning.push("Show in owner's city");
    }
  }

  // Check historical entries (would need entry history)
  // For now, add base confidence for active dogs
  if (dog.isActive !== false) {
    confidence += 0.2;
    reasoning.push('Dog is active in competitions');
  }

  // Only return prediction if confidence is reasonable
  if (confidence < 0.2) return null;

  return {
    showId: show.id,
    showName: show.name,
    dogId: dog.id,
    dogName: dog.name,
    classes: predictLikelyClasses({
      ...(dog.sex !== undefined && { sex: dog.sex }),
      ...(dog.dateOfBirth !== undefined && { dateOfBirth: dog.dateOfBirth }),
    }),
    confidence: Math.min(0.9, confidence),
    reasoning,
    estimatedEntryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
}

/** Priority weight mapping for preload task sorting */
export const PRIORITY_WEIGHTS: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** localStorage keys used by PredictiveLoader */
export const STORAGE_KEYS = {
  navPatterns: 'myk9show-nav-patterns',
  relationshipHints: 'myk9show-relationship-hints',
} as const;
