// Breed and variety data by organization
// This data structure supports organization-specific breeds with their varieties
import { AKC_BREEDS } from './akcBreeds';
import { UKC_BREEDS } from './ukcBreeds';

export interface BreedInfo {
  name: string;
  varieties: string[];
  group?: string;
}

export interface OrganizationBreeds {
  [organization: string]: BreedInfo[];
}

// Per-organization lists live in sibling modules (akcBreeds.ts, ukcBreeds.ts).
export { AKC_BREEDS, UKC_BREEDS };

// CKC (Canadian Kennel Club) - similar to AKC
export const CKC_BREEDS: BreedInfo[] = [...AKC_BREEDS];

// FCI Breeds - International, includes most breeds
const FCI_ONLY_BREEDS: BreedInfo[] = [
  { name: 'Argentinian Dogo', varieties: [], group: 'Working' },
  { name: 'Dutch Shepherd', varieties: ['Short Hair', 'Long Hair', 'Wire Hair'], group: 'Herding' },
  { name: 'German Spitz', varieties: ['Giant', 'Medium', 'Miniature'], group: 'Non-Sporting' },
  { name: 'Peruvian Inca Orchid', varieties: ['Small', 'Medium', 'Large'], group: 'Sighthound' },
  { name: 'White Swiss Shepherd Dog', varieties: [], group: 'Herding' },
];

// Entries above replace the AKC entry of the same name (FCI varieties/groups differ);
// every other FCI breed is already in AKC_BREEDS.
const FCI_OVERRIDE_NAMES = new Set(FCI_ONLY_BREEDS.map(b => b.name));
export const FCI_BREEDS: BreedInfo[] = [
  ...AKC_BREEDS.filter(b => !FCI_OVERRIDE_NAMES.has(b.name)),
  ...FCI_ONLY_BREEDS,
];

// KC (UK Kennel Club) breeds
const KC_GUNDOG_NAMES = new Set(['English Setter', 'Gordon Setter', 'Irish Setter']);
export const KC_BREEDS: BreedInfo[] = AKC_BREEDS.map(b =>
  KC_GUNDOG_NAMES.has(b.name) ? { ...b, group: 'Gundog' } : b
);

// Organization to breeds mapping
export const ORGANIZATION_BREEDS: OrganizationBreeds = {
  AKC: AKC_BREEDS,
  UKC: UKC_BREEDS,
  CKC: CKC_BREEDS,
  FCI: FCI_BREEDS,
  KC: KC_BREEDS,
  Other: AKC_BREEDS, // Default to AKC for "Other"
};

// Helper function to get breeds for an organization
export function getBreedsForOrganization(organization: string): BreedInfo[] {
  return ORGANIZATION_BREEDS[organization] || AKC_BREEDS;
}

// Helper function to get varieties for a breed in an organization
export function getVarietiesForBreed(organization: string, breedName: string): string[] {
  const breeds = getBreedsForOrganization(organization);
  const breed = breeds.find(b => b.name === breedName);
  return breed?.varieties || [];
}

// Helper function to get sorted breed names for an organization
export function getBreedNamesForOrganization(organization: string): string[] {
  const breeds = getBreedsForOrganization(organization);
  return breeds.map(b => b.name).sort((a, b) => a.localeCompare(b));
}

// Helper function to check if a breed has varieties
export function breedHasVarieties(organization: string, breedName: string): boolean {
  const varieties = getVarietiesForBreed(organization, breedName);
  return varieties.length > 0;
}

// Helper function to get the group for a breed
export function getGroupForBreed(organization: string, breedName: string): string | undefined {
  const breeds = getBreedsForOrganization(organization);
  const breed = breeds.find(b => b.name === breedName);
  return breed?.group;
}

// Helper function to get all unique groups for an organization
export function getGroupsForOrganization(organization: string): string[] {
  const breeds = getBreedsForOrganization(organization);
  const groups = new Set(breeds.map(b => b.group).filter((g): g is string => !!g));
  return Array.from(groups).sort((a, b) => a.localeCompare(b));
}

// Helper function to get breeds by group for an organization
export function getBreedsByGroup(organization: string, group: string): BreedInfo[] {
  const breeds = getBreedsForOrganization(organization);
  return breeds.filter(b => b.group === group);
}

// Organization group definitions for reference
export const AKC_GROUPS = [
  'Sporting',
  'Hound',
  'Working',
  'Terrier',
  'Toy',
  'Non-Sporting',
  'Herding',
  'Mixed Breed',
] as const;

export const UKC_GROUPS = [
  'Guardian Dog',
  'Scenthound',
  'Sighthound & Pariah Dog',
  'Gun Dog',
  'Northern Breed',
  'Herding Dog',
  'Terrier',
  'Companion Dog',
  'Mixed Breed',
] as const;

export type AKCGroup = (typeof AKC_GROUPS)[number];
export type UKCGroup = (typeof UKC_GROUPS)[number];
