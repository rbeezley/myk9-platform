# @myk9/supabase

Supabase client and utilities for the myK9 Platform.

## Overview

`@myk9/supabase` provides a configured Supabase client with multi-tenant RLS (Row Level Security) support via license key header injection. It includes React hooks, type-safe database types, and utilities for working with the unified `myk9-platform` Supabase project.

### Key Features

- Singleton Supabase client with configuration
- Automatic license key header injection for RLS
- React hooks for client access
- Type-safe database types generated from schema
- Re-exported Supabase types for convenience
- Support for both authenticated and unauthenticated access

## Installation

This package is part of the myK9 Platform monorepo:

```bash
pnpm install
```

## Quick Start

### 1. Initialize Supabase Client

```typescript
import { initSupabase } from '@myk9/supabase';

// In your app entry point (main.tsx)
initSupabase({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
});
```

### 2. Set License Key for RLS

```typescript
import { setLicenseKey } from '@myk9/supabase';

// After authentication or license validation
setLicenseKey('myK9Q1-a260f472-e0d76a33-4b6c264c');

// All subsequent queries will include x-license-key header
```

### 3. Use Client in React Components

```typescript
import { useSupabase } from '@myk9/supabase';

function MyComponent() {
  const supabase = useSupabase();

  const fetchClasses = async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .order('name');

    if (error) throw error;
    return data;
  };

  // ... rest of component
}
```

### 4. Use Client Outside React

```typescript
import { getSupabase } from '@myk9/supabase';

// In services or utilities
export async function fetchTrials(showId: string) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('trials')
    .select('*')
    .eq('show_id', showId);

  if (error) throw error;
  return data;
}
```

## Core Concepts

### Multi-Tenant RLS Architecture

The package implements multi-tenant isolation using license keys:

1. **License Key Storage**: Each user has a unique license key
2. **Header Injection**: All Supabase requests include `x-license-key` header
3. **RLS Policies**: Database policies filter data by `license_key` column
4. **Automatic Filtering**: Data is isolated at the database level

```
┌─────────────┐
│   Client    │
│  (React)    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│  @myk9/supabase         │
│  - initSupabase()       │
│  - setLicenseKey()      │
│  - Custom fetch()       │
└──────┬──────────────────┘
       │ + x-license-key header
       ▼
┌─────────────────────────┐
│  Supabase (Remote)      │
│  - RLS Policies         │
│  - Filter by license    │
└─────────────────────────┘
```

### Custom Fetch Implementation

The package uses a custom `fetch` function to inject the license key header:

```typescript
// Internal implementation
const createCustomFetch = () => {
  return (url: RequestInfo | URL, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers);

    if (currentLicenseKey) {
      headers.set('x-license-key', currentLicenseKey);
    }

    return fetch(url, { ...options, headers });
  };
};
```

This ensures that:
- All Supabase API calls include the license key
- RLS policies receive the header for filtering
- Multi-tenant isolation is automatic and transparent

## API Reference

### Client Initialization

#### initSupabase()

Initialize the Supabase client with configuration.

```typescript
function initSupabase(config: SupabaseConfig): SupabaseClient

interface SupabaseConfig {
  url: string;
  anonKey: string;
}
```

**Usage:**

```typescript
import { initSupabase } from '@myk9/supabase';

// Initialize once at app startup
initSupabase({
  url: 'https://sojmvhhwsjxmfistvzbe.supabase.co',
  anonKey: 'your-anon-key-here'
});
```

**Notes:**
- Call once at app startup (e.g., `main.tsx`)
- Subsequent calls with same config return existing instance
- Throws error if config is missing or invalid
- Creates singleton instance

#### getSupabase()

Get the initialized Supabase client instance.

```typescript
function getSupabase(): SupabaseClient
```

**Usage:**

```typescript
import { getSupabase } from '@myk9/supabase';

// In services or utilities
export async function fetchData() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('dogs')
    .select('*');

  if (error) throw error;
  return data;
}
```

**Notes:**
- Throws error if `initSupabase()` hasn't been called
- Use for non-React code (services, utilities)
- Returns singleton instance

#### isSupabaseInitialized()

Check if the Supabase client is initialized.

```typescript
function isSupabaseInitialized(): boolean
```

**Usage:**

```typescript
import { isSupabaseInitialized } from '@myk9/supabase';

if (!isSupabaseInitialized()) {
  console.warn('Supabase not initialized');
  // Handle initialization
}
```

### License Key Management

#### setLicenseKey()

Set the license key for RLS filtering.

```typescript
function setLicenseKey(licenseKey: string | null): void
```

**Usage:**

```typescript
import { setLicenseKey } from '@myk9/supabase';

// Set license key after authentication
async function login(passcode: string) {
  const user = await authenticateUser(passcode);
  setLicenseKey(user.license_key);
}

// Clear license key on logout
function logout() {
  setLicenseKey(null);
}
```

**Notes:**
- Must be called after authentication
- Affects all subsequent Supabase queries
- Pass `null` to clear (e.g., on logout)
- Header is included automatically in all requests

#### getLicenseKey()

Get the current license key.

```typescript
function getLicenseKey(): string | null
```

**Usage:**

```typescript
import { getLicenseKey } from '@myk9/supabase';

const currentKey = getLicenseKey();

if (currentKey) {
  console.log('License key is set');
} else {
  console.log('No license key');
}
```

### React Hooks

#### useSupabase()

React hook for accessing the Supabase client.

```typescript
function useSupabase(): SupabaseClient
```

**Usage:**

```typescript
import { useSupabase } from '@myk9/supabase';

function ClassList() {
  const supabase = useSupabase();
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    async function fetchClasses() {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('name');

      if (error) {
        console.error(error);
        return;
      }

      setClasses(data);
    }

    fetchClasses();
  }, [supabase]);

  return (
    <div>
      {classes.map(cls => (
        <div key={cls.id}>{cls.name}</div>
      ))}
    </div>
  );
}
```

**Notes:**
- Returns the singleton Supabase instance
- Safe to use in dependency arrays
- Throws error if `initSupabase()` not called

### Types

#### Database Types

Type-safe database types generated from Supabase schema.

```typescript
import type { Database } from '@myk9/supabase';

// Use with Supabase client
type Tables = Database['public']['Tables'];
type Class = Tables['classes']['Row'];
type ClassInsert = Tables['classes']['Insert'];
type ClassUpdate = Tables['classes']['Update'];

// Use in functions
function updateClass(id: string, updates: ClassUpdate) {
  // TypeScript knows the valid fields
}
```

#### Re-exported Supabase Types

Commonly used Supabase types for convenience.

```typescript
import type {
  PostgrestError,
  PostgrestResponse,
  PostgrestSingleResponse,
  PostgrestMaybeSingleResponse,
  RealtimeChannel,
  RealtimePostgresChangesPayload
} from '@myk9/supabase';

// Use in error handling
function handleError(error: PostgrestError) {
  console.error(error.message, error.details);
}

// Use with queries
const response: PostgrestResponse<Class> = await supabase
  .from('classes')
  .select('*');
```

## Usage Examples

### Complete Setup Example

```typescript
// main.tsx
import { initSupabase, setLicenseKey } from '@myk9/supabase';

// Initialize Supabase
initSupabase({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
});

// Set license key after authentication
async function authenticate(passcode: string) {
  const { data, error } = await getSupabase()
    .rpc('validate_passcode', { p_passcode: passcode });

  if (error) throw error;

  // Set license key for RLS
  setLicenseKey(data.license_key);

  return data;
}
```

### React Query Integration

```typescript
import { useSupabase } from '@myk9/supabase';
import { useQuery } from '@tanstack/react-query';

function useClasses(trialId: string) {
  const supabase = useSupabase();

  return useQuery({
    queryKey: ['classes', trialId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('trial_id', trialId)
        .order('name');

      if (error) throw error;
      return data;
    }
  });
}

function ClassList({ trialId }: { trialId: string }) {
  const { data: classes, isLoading } = useClasses(trialId);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {classes?.map(cls => (
        <div key={cls.id}>{cls.name}</div>
      ))}
    </div>
  );
}
```

### Real-time Subscriptions

```typescript
import { useSupabase } from '@myk9/supabase';
import { useEffect, useState } from 'react';

function LiveClassList({ trialId }: { trialId: string }) {
  const supabase = useSupabase();
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    // Initial fetch
    async function fetchClasses() {
      const { data } = await supabase
        .from('classes')
        .select('*')
        .eq('trial_id', trialId);

      setClasses(data || []);
    }

    fetchClasses();

    // Subscribe to changes
    const channel = supabase
      .channel(`classes-${trialId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'classes',
          filter: `trial_id=eq.${trialId}`
        },
        (payload) => {
          console.log('Change received:', payload);
          // Refetch or update local state
          fetchClasses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, trialId]);

  return (
    <div>
      {classes.map(cls => (
        <div key={cls.id}>{cls.name}</div>
      ))}
    </div>
  );
}
```

### Service Layer Pattern

```typescript
// services/classService.ts
import { getSupabase } from '@myk9/supabase';
import type { Database } from '@myk9/supabase';

type Class = Database['public']['Tables']['classes']['Row'];
type ClassInsert = Database['public']['Tables']['classes']['Insert'];
type ClassUpdate = Database['public']['Tables']['classes']['Update'];

export const classService = {
  async getAll(trialId: string): Promise<Class[]> {
    const { data, error } = await getSupabase()
      .from('classes')
      .select('*')
      .eq('trial_id', trialId)
      .order('name');

    if (error) throw error;
    return data;
  },

  async getById(id: string): Promise<Class> {
    const { data, error } = await getSupabase()
      .from('classes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(classData: ClassInsert): Promise<Class> {
    const { data, error } = await getSupabase()
      .from('classes')
      .insert(classData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, updates: ClassUpdate): Promise<Class> {
    const { data, error } = await getSupabase()
      .from('classes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await getSupabase()
      .from('classes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
```

### Error Handling

```typescript
import { getSupabase, type PostgrestError } from '@myk9/supabase';

async function fetchClassesSafely(trialId: string) {
  try {
    const { data, error } = await getSupabase()
      .from('classes')
      .select('*')
      .eq('trial_id', trialId);

    if (error) {
      handleSupabaseError(error);
      return [];
    }

    return data;
  } catch (err) {
    console.error('Unexpected error:', err);
    return [];
  }
}

function handleSupabaseError(error: PostgrestError) {
  console.error('Supabase error:', {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code
  });

  // Show user-friendly message
  if (error.code === 'PGRST116') {
    alert('No data found');
  } else if (error.code === '23505') {
    alert('Duplicate entry');
  } else {
    alert('An error occurred. Please try again.');
  }
}
```

## Generating Types

The package includes a script to regenerate database types from Supabase schema:

```bash
# In packages/supabase directory
pnpm generate-types
```

This runs:
```bash
supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/types/database.types.ts
```

**Notes:**
- Requires `SUPABASE_PROJECT_ID` environment variable
- Requires Supabase CLI installed and authenticated
- Run after schema changes to update types
- Generated types live in `src/types/database.types.ts`; other database type files re-export from that canonical source.

## Package Structure

```
packages/supabase/
├── src/
│   ├── client.ts              # Client factory and utilities
│   ├── hooks/
│   │   └── useSupabase.ts     # React hooks
│   ├── types/
│   │   └── database.types.ts  # Generated database types
│   └── index.ts               # Public API
├── package.json
└── README.md
```

## API Reference

### Exports

```typescript
// Client
export {
  initSupabase,
  getSupabase,
  setLicenseKey,
  getLicenseKey,
  isSupabaseInitialized,
  type SupabaseConfig,
  type SupabaseClient
}

// React hooks
export { useSupabase }

// Database types
export type { Database }

// Re-exported Supabase types
export type {
  PostgrestError,
  PostgrestResponse,
  PostgrestSingleResponse,
  PostgrestMaybeSingleResponse,
  RealtimeChannel,
  RealtimePostgresChangesPayload
}
```

## Development

### Building

```bash
pnpm build
```

### Watch Mode

```bash
pnpm dev
```

### Type Checking

```bash
pnpm typecheck
```

### Clean Build

```bash
pnpm clean
```

### Generate Types

```bash
# Set environment variable
export SUPABASE_PROJECT_ID=sojmvhhwsjxmfistvzbe

# Generate types
pnpm generate-types
```

## Dependencies

### Runtime Dependencies

- **@supabase/supabase-js** (^2.93.3) - Supabase JavaScript client

### Dev Dependencies

- **@myk9/core** (workspace:*) - Core utilities (for logger)
- **typescript** (^5.9.3)
- **tsup** (^8.5.1)
- **rimraf** (^6.1.2)

### Peer Dependencies

- **react** (>=18.0.0) - Optional, only needed for hooks

## Used By

- **@myk9/show** - myK9Show application
- **@myk9/q** - myK9Q application
- **@myk9/replication** - Replication package

## Contributing

When contributing to `@myk9/supabase`:

1. **Singleton pattern** - Maintain single client instance
2. **License key injection** - Keep RLS header logic intact
3. **Type safety** - Regenerate types after schema changes
4. **Error handling** - Use proper error types
5. **React optional** - Keep React as peer dependency
6. **No business logic** - This is a thin wrapper only

### Making Changes

1. Update client logic in `src/client.ts`
2. Update hooks in `src/hooks/`
3. Regenerate types if schema changed
4. Build and test:
   ```bash
   pnpm build && pnpm typecheck
   ```
5. Update this README if API changed

## Best Practices

### 1. Initialize Once

```typescript
// Good: Initialize at app startup
initSupabase(config);

// Avoid: Initializing multiple times
initSupabase(config1);
initSupabase(config2); // Returns existing instance
```

### 2. Set License Key After Auth

```typescript
// Good: Set license key after authentication
async function login(passcode: string) {
  const user = await authenticate(passcode);
  setLicenseKey(user.license_key);
}

// Avoid: Using client before setting license key
// (queries will not be filtered by tenant)
```

### 3. Use Hooks in React Components

```typescript
// Good: Use hook in React
function MyComponent() {
  const supabase = useSupabase();
  // ...
}

// Good: Use getter in services
export async function fetchData() {
  const supabase = getSupabase();
  // ...
}
```

### 4. Type Your Queries

```typescript
// Good: Use generated types
type Class = Database['public']['Tables']['classes']['Row'];

const { data } = await supabase
  .from('classes')
  .select('*');
// data is Class[]

// Avoid: Using 'any'
const { data }: any = await supabase...
```

### 5. Handle Errors Properly

```typescript
// Good: Check error and handle
const { data, error } = await supabase...
if (error) {
  handleError(error);
  return;
}
// Use data safely

// Avoid: Ignoring errors
const { data } = await supabase...
// What if there was an error?
```

## Troubleshooting

### Client Not Initialized Error

```
Error: Supabase client not initialized. Call initSupabase() first.
```

**Solution:**
```typescript
// Add to app entry point (main.tsx)
import { initSupabase } from '@myk9/supabase';

initSupabase({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
});
```

### RLS Policies Blocking Queries

If queries return empty when data exists:

1. Check license key is set: `getLicenseKey()`
2. Verify RLS policies in Supabase dashboard
3. Check `license_key` column exists in table
4. Test query with RLS disabled (temporarily)

### Type Generation Fails

```bash
# Make sure you're authenticated
supabase login

# Check project ID
echo $SUPABASE_PROJECT_ID

# Generate manually
supabase gen types typescript --project-id sojmvhhwsjxmfistvzbe > src/types/database.types.ts
```

### Hook Not Working

```
Error: useSupabase must be called within a React component
```

**Solution:**
```typescript
// Use hook only in React components
function MyComponent() {
  const supabase = useSupabase();
  // ...
}

// Use getter in services
function myService() {
  const supabase = getSupabase();
  // ...
}
```

## Supabase Project Info

**Unified Project:** `myk9-platform`

- **Project URL:** `https://sojmvhhwsjxmfistvzbe.supabase.co`
- **Project ID:** `sojmvhhwsjxmfistvzbe`
- **Region:** us-east-2
- **Tables:** 56 with RLS enabled
- **RLS Policies:** 124 policies

## License

Private - myK9 Platform

## Support

For questions or issues related to `@myk9/supabase`:
- Review this README and source code
- Check Supabase documentation
- Verify RLS policies in dashboard
- Test queries with Supabase MCP tools
- Consult project CLAUDE.md for patterns
- Ask in team chat

---

**Version:** 0.0.1
**Last Updated:** 2026-02-03
