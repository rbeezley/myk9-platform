# @myk9/supabase

Canonical generated Supabase database types for the myK9 Platform.

The application owns its configured Supabase client in
`apps/myk9show/src/services/database/supabaseClient.ts`; this package does not
provide a second client singleton or React hook.

## Exports

The package exports the generated `Database`, `Tables`, `TablesInsert`,
`TablesUpdate`, `Enums`, `CompositeTypes`, and `Json` types, plus the generated
`Constants` value and selected Supabase response types.

```ts
import type { Database, Tables } from '@myk9/supabase';
import { Constants } from '@myk9/supabase';

type Show = Tables<'shows'>;
const publicEnums = Constants.public.Enums;
```

Inside `apps/myk9show`, import `Database` from `@/types/supabase` rather than
from `@myk9/supabase`: hand-maintained corrections to the generated type live in
`apps/myk9show/src/types/database-overrides.ts` (the generator cannot see RPC
argument nullability) and this package does not carry them. Add a widening there
only with a citation to the migration line that establishes the contract, and
note that `scripts/qa/supabase-types-drift.sh` diffs this package's generated
file only — it does not cover the overlay.

Regenerate the schema types with `pnpm generate-types` after linking the
Supabase project.
