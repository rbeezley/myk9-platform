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

Regenerate the schema types with `pnpm generate-types` after linking the
Supabase project.
