// Authoritative data access module for the Pedigree entity (a Dog's ancestor lineage).
// All callers import from here — never from supabaseClient directly.

export { getPedigreeAncestors } from './reads';

export { upsertPedigreeAncestor, updatePedigreeAncestor, deletePedigreeAncestor } from './writes';
