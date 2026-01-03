/**
 * Utility functions for working with dog data
 */

import type { Dog } from '@/types/dog-types';

/**
 * Get the first breed from a dog's registrations
 */
export function getFirstBreed(dog: Dog): string {
  if (!dog.registrations || dog.registrations.length === 0) {
    return 'No registrations';
  }
  const firstBreed = dog.registrations[0]?.breed;
  return firstBreed || 'Breed not specified';
}

/**
 * Get all unique breeds from a dog's registrations
 */
export function getAllBreeds(dog: Dog): string[] {
  if (!dog.registrations || dog.registrations.length === 0) {
    return [];
  }
  return Array.from(new Set(
    dog.registrations.map(reg => reg.breed).filter((breed): breed is string => Boolean(breed))
  ));
}

/**
 * Get breeds as a comma-separated string
 */
export function getBreedsAsString(dog: Dog): string {
  const breeds = getAllBreeds(dog);
  return breeds.length > 0 ? breeds.join(', ') : 'No breed specified';
}

/**
 * Check if a dog has registrations
 */
export function hasRegistrations(dog: Dog): boolean {
  return Boolean(dog.registrations && dog.registrations.length > 0);
}

// Utility functions for dog-related data
export function calculateAge(dateOfBirth: string): string {
  if (!dateOfBirth) return '';
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) return '';
  if (years === 0) return `${months} month${months !== 1 ? 's' : ''}`;
  if (months === 0) return `${years} year${years !== 1 ? 's' : ''}`;
  return `${years} year${years !== 1 ? 's' : ''}, ${months} month${months !== 1 ? 's' : ''}`;
}

export function getOrganizationBadgeColor(org: string): string {
  switch (org) {
    case 'AKC':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'UKC':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'CKC':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}
