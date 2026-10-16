// Authoritative data access module for dog/organization Registration records
// (e.g. AKC registration numbers attached to Dogs).
// Distinct from ../show-registrations/ (show entry confirmation records).
// All callers import from here — never from supabaseClient directly. Writes
// to a dog's registrations are queued on the registrations replica instead
// (`replicatedDogRegistrationsTable`, MYK9-1090).

export {
  getRegistrationById,
  getRegistrationsByDog,
  getRegistrationsByOrganization,
  updateRegistration,
  searchRegistrations,
  getRegistrationStatistics,
  validateRegistrationNumber,
  getRegistrationsByOwner,
} from './reads';

export { isRegistryIdentityTaken } from './registryIdentityTaken';
