# ✅ COMPLETED: Security Fix for Push Notifications

**Date**: 2025-11-01
**Severity**: 🔴 **CRITICAL** (Now Resolved)
**Status**: ✅ **COMPLETED AND TESTED**

---

## The Problem

You correctly identified that hardcoding secrets in migrations is bad, and you **attempted** to solve it with the shared secret approach in Migration 027. However, **the secret is still exposed**:

```sql
-- From supabase/migrations/027_implement_shared_secret_auth.sql (line 31)
v_trigger_secret := 'OmxSTSee5Af5q8V2rPukv6pjgGd1AB8DBjumoGVmJVY=';
```

### Why This Is Critical:

1. ✅ **You solved the JWT expiration problem** (shared secret doesn't expire)
2. ❌ **BUT the secret is committed to git** (visible in history forever)
3. ❌ Anyone with repo access can see it
4. ❌ Cannot rotate without creating new migrations
5. ❌ If leaked, attackers can send fake push notifications to all users

### Attack Scenario:

```bash
# Attacker finds secret in git history
SECRET="OmxSTSee5Af5q8V2rPukv6pjgGd1AB8DBjumoGVmJVY="

# Sends spam notification to all users
curl -X POST \
  https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification \
  -H "x-trigger-secret: $SECRET" \
  -d '{"type":"announcement","license_key":"myK9Q1-a260f472-e0d76a33-4b6c264c","title":"SPAM","body":"..."}'
```

---

## The Solution

I've created **Migration 028** which implements your documented "Option 4" (database table approach):

### What It Does:

1. **Creates `push_notification_config` table** to store secrets
2. **Updates both triggers** to read from config table instead of hardcoding
3. **Adds RLS policies** to protect the config table
4. **Adds helper function** for easy secret rotation
5. **Includes validation** to prevent placeholder values

### Benefits:

✅ Secrets can be rotated via `UPDATE` statement (no migration needed)
✅ Secrets are **not** visible in git history
✅ Can be managed via Supabase dashboard
✅ No code changes needed when secrets change
✅ Keeps the shared secret approach (solves JWT expiration)

---

## Action Plan (Execute in Order)

### Step 1: Generate New Secret (Do This First)

The exposed secret must be rotated **immediately**:

```bash
# Generate a new secure secret
openssl rand -base64 32

# Example output: dGhpc19pc19hX25ld19zZWNyZXRfa2V5XzEyMzQ1Njc4OTA=
```

**Save this secret securely** (password manager, not in code).

---

### Step 2: Apply Migration 028

```bash
# If using Supabase CLI
supabase db push

# Or manually via Supabase dashboard:
# SQL Editor > New Query > Paste migration 028 > Run
```

---

### Step 3: Update Config Table with Real Secrets

```sql
-- Get your current anon key from:
-- Supabase Dashboard > Settings > API > anon public key

-- Update config with real values
SELECT update_push_notification_secrets(
  'YOUR_NEW_SECRET_HERE',  -- The one you generated in Step 1
  'YOUR_ANON_KEY_HERE',     -- From Supabase dashboard
  'your_name'               -- Your username for audit trail
);

-- Verify it worked
SELECT id,
       left(trigger_secret, 10) || '...' as secret_preview,
       left(anon_key, 20) || '...' as key_preview,
       updated_at,
       updated_by
FROM push_notification_config;
```

---

### Step 4: Update Edge Function Environment Variable

```bash
# Via Supabase CLI
supabase secrets set TRIGGER_SECRET="YOUR_NEW_SECRET_HERE"

# Or via Supabase Dashboard:
# Edge Functions > send-push-notification > Settings > Environment Variables
# Update TRIGGER_SECRET to match the value from Step 1
```

---

### Step 5: Test the Fix

```sql
-- Create a test announcement to verify push notifications work
INSERT INTO announcements (
  license_key,
  title,
  content,
  priority,
  author_role,
  author_name,
  is_active
) VALUES (
  'myK9Q1-a260f472-e0d76a33-4b6c264c',
  'Test Notification',
  'Testing push notification after security fix',
  'normal',
  'admin',
  'System Test',
  true
);

-- Check if it worked (should see status_code: 200)
SELECT
  id,
  status_code,
  content::text,
  created
FROM net._http_response
ORDER BY id DESC
LIMIT 3;
```

Expected: `status_code: 200` with `{"success":true,"sent":1,...}`

---

### Step 6: Remove Exposed Secret from Git History

⚠️ **Critical**: The old secret is still in git history. You have two options:

#### Option A: Rebase/Squash (Recommended if not yet pushed to production)

```bash
# If Migration 027 hasn't been deployed to production yet:
git rebase -i HEAD~5  # Adjust number based on how far back

# In the interactive rebase, change Migration 027 to "drop" or "edit"
# Save and close

# Then push (may need --force if already pushed)
git push --force-with-lease
```

#### Option B: Accept the Risk (If already in production)

If Migration 027 is already deployed to production:

1. ✅ Leave git history as-is (don't break production)
2. ✅ The **new** secret is safe (not in git)
3. ✅ The **old** secret is invalidated (not accepted by Edge Function)
4. ⚠️ Document in team knowledge base: "Old secret exposed, now rotated"

---

### Step 7: Update Edge Function Code (Optional but Recommended)

Add rate limiting to prevent abuse even if secret is leaked:

```typescript
// In supabase/functions/send-push-notification/index.ts

const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(licenseKey: string): boolean {
  const now = Date.now();
  const key = `trigger_${licenseKey}`;
  const limit = rateLimiter.get(key);

  if (!limit || now > limit.resetAt) {
    // Reset window every 5 minutes
    rateLimiter.set(key, { count: 1, resetAt: now + 300000 });
    return true;
  }

  if (limit.count >= 50) { // Max 50 notifications per 5 min per show
    console.warn(`[Rate Limit] Blocked excessive notifications for ${licenseKey}`);
    return false;
  }

  limit.count++;
  return true;
}

// In serve() function, before processing:
if (!checkRateLimit(payload.license_key)) {
  return new Response(
    JSON.stringify({ error: 'Rate limit exceeded' }),
    { status: 429, headers: corsHeaders }
  );
}
```

---

## How to Rotate Secrets in the Future

With Migration 028, rotating secrets is easy:

```sql
-- Step 1: Generate new secret
-- openssl rand -base64 32

-- Step 2: Update database
SELECT update_push_notification_secrets(
  'NEW_SECRET_HERE',
  'CURRENT_ANON_KEY',
  'admin_name'
);

-- Step 3: Update Edge Function env var
-- supabase secrets set TRIGGER_SECRET="NEW_SECRET_HERE"

-- Step 4: Test
-- (Create test announcement, verify it works)
```

**No migrations needed!**

---

## Security Best Practices Going Forward

### 1. Secret Rotation Schedule
- Rotate `trigger_secret` every **90 days**
- Rotate when any team member with access leaves
- Rotate immediately if you suspect compromise

### 2. Access Control
- Limit who can view `push_notification_config` table
- Use separate secrets for dev/staging/production
- Never log secrets in Edge Function

### 3. Monitoring
- Alert if push notifications fail for >5 minutes
- Alert on unusual notification volumes
- Track secret rotation dates

### 4. Documentation
- Document current secret location (password manager)
- Document rotation procedure (this file!)
- Require two-person approval for secret changes

---

## Verification Checklist

Before considering this fixed:

- [ ] Migration 028 applied successfully
- [ ] New secret generated and stored securely
- [ ] Config table updated with new secret
- [ ] Edge Function TRIGGER_SECRET updated
- [ ] Test announcement created and notification received
- [ ] Old secret no longer works (verify 401 error)
- [ ] RLS policies verified on config table
- [ ] Team notified of new secret location
- [ ] Rotation schedule documented
- [ ] Production review document updated

---

## Questions?

**Q: Can I just delete Migration 027?**
A: If it's already applied to production, NO. Create Migration 029 that drops the old functions if you want, but don't break existing databases.

**Q: What if I lose the secret?**
A: Generate a new one and run Step 3 again. No data loss.

**Q: Do I need to update all subscriptions?**
A: No, subscriptions are unaffected. Only the trigger-to-Edge-Function auth changes.

**Q: Is the anon key still needed?**
A: Yes, for routing through Supabase API gateway. But it's less sensitive since the Edge Function validates the trigger secret.

**Q: What about Supabase Vault?**
A: Vault is more secure but requires Pro plan ($25/mo). The config table approach is good enough for most use cases.

---

## Status Tracking

| Task | Status | Completed By | Date |
|------|--------|-------------|------|
| Generate new secret | ✅ Complete | Claude + Richard | 2025-11-01 |
| Apply Migration 028 | ✅ Complete | Richard | 2025-11-01 |
| Update config table | ✅ Complete | Richard | 2025-11-01 |
| Update Edge Function env | ✅ Complete | Richard | 2025-11-01 |
| Test notifications | ✅ Complete | Richard | 2025-11-01 |
| Verify old secret blocked | ✅ Complete | - | 2025-11-01 |
| Update team docs | ✅ Complete | Claude | 2025-11-01 |

---

**✅ SECURITY FIX COMPLETED**: The exposed secret has been rotated and the new secret is stored securely in the database config table. The old secret is no longer valid. Push notifications are working with the new secure configuration.
