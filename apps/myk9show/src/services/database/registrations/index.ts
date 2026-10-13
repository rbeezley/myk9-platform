// Authoritative data access module for dog/organization Registration records
// (e.g. AKC registration numbers attached to Dogs).
// Distinct from ../show-registrations/ (show entry confirmation records).
// All callers import from here — never from supabaseClient directly.

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
} from './reads';
