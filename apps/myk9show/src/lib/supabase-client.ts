// Re-export from the main client to avoid multiple instances
export { supabase } from '../services/database/supabaseClient';
export { default } from '../services/database/supabaseClient';

// Export types for convenience
export type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';