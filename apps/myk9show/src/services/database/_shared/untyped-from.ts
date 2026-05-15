// Escape hatch for Supabase tables not yet included in the generated Database type.
// Use sparingly — when a table joins the generated types, callers should switch back
// to the typed `supabase.from(...)`.

import { supabase } from '../supabaseClient';

export const untypedFrom = (table: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional escape hatch
  (supabase as unknown as { from(t: string): any }).from(table);
