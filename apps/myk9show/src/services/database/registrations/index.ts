// Authoritative data access module for dog/organization Registration records.
// All callers import from here — never from supabaseClient directly.
//
// Note: covers registrationQueries.ts (dog breed org registrations e.g. AKC).
// Distinct from ../show-registrations/ (show entry confirmation records).

export {
  getAllRegistrations,
  getRegistrationById,
  getRegistrationsByDog,
  getRegistrationsByOrganization,
  createRegistration,
  updateRegistration,
  deleteRegistration,
  searchRegistrations,
  getRegistrationStatistics,
  validateRegistrationNumber,
  getRegistrationsByOwner,
} from '../queries/registrationQueries';
