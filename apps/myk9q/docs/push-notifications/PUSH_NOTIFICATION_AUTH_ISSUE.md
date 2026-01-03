# Push Notification Authentication Issue

## Problem
Database triggers (`notify_announcement_created` and `notify_up_soon`) use hardcoded Supabase anon keys to authenticate with the Edge Function. When the anon key changes (due to JWT secret rotation, project settings changes, or security updates), the triggers break with "401 Invalid JWT" errors.

## Current Workaround
We update the anon key in the triggers via migrations whenever it changes:
- Migration 021: Initial announcement trigger auth fix
- Migration 025: Updated up_soon trigger auth
- Migration 026: Updated both triggers with current key (2025-11-01)

**Current anon key expires:** 2070-06-02

## Symptoms of Broken Auth
- Push notifications stop working
- pg_net._http_response table shows `status_code: 401` with `"Invalid JWT"` message
- No notifications received despite triggers firing

## How to Fix When Key Changes

1. Get the current anon key:
   ```bash
   # Via Supabase dashboard: Settings > API > anon public key
   # OR via MCP tool (if available)
   ```

2. Create a new migration updating both functions:
   ```sql
   v_anon_key := 'NEW_ANON_KEY_HERE';
   ```

3. Apply the migration to production database

## Long-Term Solutions

### Option 1: Use Supabase Vault (Recommended)
Store the anon key in Supabase Vault and retrieve it dynamically:

```sql
-- Store key once
SELECT vault.create_secret('push_notification_anon_key', 'YOUR_ANON_KEY');

-- Retrieve in trigger
v_anon_key := vault.read_secret('push_notification_anon_key');
```

**Pros:**
- No migration needed when key changes
- Centralized secret management
- Can be updated via dashboard or API

**Cons:**
- Requires Supabase Pro plan
- Adds dependency on Vault service

### Option 2: Edge Function Without Auth
Modify the Edge Function to accept trigger requests without JWT auth by using a shared secret:

```typescript
// Edge Function
const triggerSecret = Deno.env.get('TRIGGER_SECRET');
const authHeader = req.headers.get('x-trigger-secret');

if (authHeader === triggerSecret) {
  // Process request
}
```

**Pros:**
- No anon key dependency
- Simple to maintain

**Cons:**
- Less secure (relies on secret not being leaked)
- Requires Edge Function redeployment

### Option 3: Service Role Key
Use the service_role key instead of anon key (rotates less frequently):

```sql
v_service_key := 'SERVICE_ROLE_KEY';
```

**Pros:**
- Service role keys rotate less often
- Buys more time between updates

**Cons:**
- Still requires migration when it does rotate
- Service role has elevated permissions (security risk if leaked)

### Option 4: Database Table for Config
Store the anon key in a database table:

```sql
CREATE TABLE push_notification_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  anon_key TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- In trigger
SELECT anon_key INTO v_anon_key FROM push_notification_config WHERE id = 1;
```

**Pros:**
- Can be updated via SQL without migration
- Simple implementation

**Cons:**
- Key visible in plaintext in database
- Requires manual update when key changes

## Recommended Action Plan

1. **Short-term (current):** Continue using migration-based updates (documented in Migration 026)
2. **Medium-term:** Implement Option 4 (database table) for easier updates without migrations
3. **Long-term:** Migrate to Option 1 (Supabase Vault) when upgrading to Pro plan

## Testing Key Updates

After updating the anon key, verify it works:

```sql
-- Check recent HTTP responses
SELECT id, status_code, content, created
FROM net._http_response
ORDER BY id DESC LIMIT 5;

-- Status 200 = success
-- Status 401 = auth failure (key is wrong)
```

## Related Files
- `supabase/migrations/021_fix_push_notification_auth.sql`
- `supabase/migrations/025_update_up_soon_anon_key.sql`
- `supabase/migrations/026_update_all_triggers_anon_key.sql`
- `supabase/functions/send-push-notification/index.ts`
