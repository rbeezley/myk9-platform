// Authoritative data access module for Manual Results
// (owner-entered competition results, distinct from in-system Show results).
// All callers import from here — never from supabaseClient directly.

export { getAllManualResults, getQualifyingManualResults, getManualResultById } from './reads';

export { createManualResult, updateManualResult, deleteManualResult } from './writes';
