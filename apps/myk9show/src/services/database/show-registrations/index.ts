// Authoritative data access module for show registration DB records.
// All callers import from here — never from supabaseClient directly.
//
// Note: distinct from the Zustand showRegistrationStore (wizard cart state).
// This module covers the persisted DB registrations with confirmation numbers.

export {
  createShowRegistration,
  getRegistrationByShowAndHandler,
  getRegistrationByConfirmationNumber,
  getRegistrationsForShow,
  updateRegistrationPayment,
  getConfirmationNumbersForEntries,
  updateEnrollmentPaymentStatus,
} from '../queries/showRegistrationQueries';
