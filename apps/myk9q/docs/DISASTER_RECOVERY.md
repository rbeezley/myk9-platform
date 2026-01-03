# Disaster Recovery Runbook

Last updated: 2026-01-02

## Quick Reference

| Component | Backup Status | Recovery Method |
|-----------|--------------|-----------------|
| Database (PostgreSQL) | Auto (daily + PITR) | Supabase Dashboard |
| Edge Functions | Git repo | Redeploy from source |
| Frontend | Git repo | Vercel auto-deploy |
| Environment Secrets | Manual | Re-enter in dashboards |
| Storage Files | Separate from DB | Contact Supabase support |

---

## 1. Database Recovery

### Supabase Project Details
- **Project ID**: `yyzgjyiqgmjzyhzkqdfx`
- **Region**: us-east-2
- **Plan**: Pro (includes PITR)
- **Database Version**: PostgreSQL 17.4.1

### Automatic Backups (Pro Plan)
- **Daily backups**: Retained for 7 days
- **Point-in-Time Recovery (PITR)**: Any second in last 7 days

### Restore Procedure

#### Option A: Point-in-Time Recovery (Preferred)
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/yyzgjyiqgmjzyhzkqdfx)
2. Navigate to **Settings > Database > Backups**
3. Select **Point in Time Recovery**
4. Choose the exact timestamp to restore to
5. Confirm restore

#### Option B: Restore to Branch (Test First)
1. Create a new branch: **Database > Branches > Create Branch**
2. Restore backup to the branch
3. Verify data integrity
4. If verified, restore to production

#### Option C: Manual pg_dump Restore
```bash
# Export from backup
pg_dump -h db.yyzgjyiqgmjzyhzkqdfx.supabase.co -U postgres -d postgres > backup.sql

# Restore to new database
psql -h NEW_HOST -U postgres -d postgres < backup.sql
```

---

## 2. Edge Functions Recovery

### Deployed Functions
| Function | Purpose |
|----------|---------|
| `send-push-notification` | Web Push notifications from DB triggers |
| `search-rules-v2` | AI-powered rules search (Claude Haiku) |
| `ask-myk9q` | AI chatbot for rules and show data queries |
| `validate-passcode` | Server-side passcode validation with rate limiting |

### Redeploy Procedure
```bash
# From project root
npx supabase functions deploy send-push-notification
npx supabase functions deploy search-rules-v2
npx supabase functions deploy ask-myk9q
npx supabase functions deploy validate-passcode
```

### Required Secrets (Set in Supabase Dashboard)
Navigate to: **Settings > Edge Functions > Secrets**

| Secret Name | Description | Where to Get |
|-------------|-------------|--------------|
| `SUPABASE_URL` | Auto-set by Supabase | N/A |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-set by Supabase | N/A |
| `ANTHROPIC_API_KEY` | Claude API key | [Anthropic Console](https://console.anthropic.com/settings/keys) |
| `VITE_VAPID_PUBLIC_KEY` | Push notification public key | See VAPID section |
| `VAPID_PRIVATE_KEY` | Push notification private key | See VAPID section |
| `TRIGGER_SECRET` | DB trigger auth secret | Generate new UUID |

---

## 3. Frontend Recovery

### Vercel Deployment
- **Repo**: GitHub (auto-deploy on push)
- **Production Domain**: myk9q.com
- **Staging Domain**: app.myk9q.com

### Redeploy Procedure
```bash
# Push to main branch triggers auto-deploy
git push origin main

# Or manual deploy from Vercel dashboard
# https://vercel.com/dashboard
```

### Vercel Environment Variables
Navigate to: **Project Settings > Environment Variables**

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_VAPID_PUBLIC_KEY` | Push notification public key |
| `VITE_PUSH_NOTIFICATIONS_ENABLED` | `true` |

---

## 4. Secrets Recovery

### VAPID Keys (Push Notifications)
If lost, generate new keys:
```bash
npm install -g web-push
web-push generate-vapid-keys
```

**After regenerating:**
1. Update Supabase Edge Function secrets
2. Update Vercel environment variables
3. Update `push_notification_config` table in database
4. Users will need to re-subscribe to push notifications

### Database Trigger Secret
Generate new UUID:
```bash
uuidgen  # or use online UUID generator
```
Update in:
1. Supabase Edge Function secrets (`TRIGGER_SECRET`)
2. `push_notification_config` table (`trigger_secret` column)

---

## 5. Complete Disaster Recovery Checklist

### Scenario: Total Project Loss

- [ ] **Create new Supabase project** (same region: us-east-2)
- [ ] **Restore database** from PITR or daily backup
- [ ] **Configure Edge Function secrets**:
  - [ ] `ANTHROPIC_API_KEY`
  - [ ] `VITE_VAPID_PUBLIC_KEY`
  - [ ] `VAPID_PRIVATE_KEY`
  - [ ] `TRIGGER_SECRET`
- [ ] **Deploy Edge Functions**:
  ```bash
  npx supabase functions deploy send-push-notification
  npx supabase functions deploy search-rules-v2
  npx supabase functions deploy ask-myk9q
  npx supabase functions deploy validate-passcode
  ```
- [ ] **Update Vercel environment** with new Supabase URL/keys
- [ ] **Trigger Vercel redeploy**
- [ ] **Update DNS** if domain changed
- [ ] **Verify**:
  - [ ] App loads and authenticates
  - [ ] Data displays correctly
  - [ ] Push notifications work
  - [ ] Rules search works
  - [ ] Realtime subscriptions work

---

## 6. What's NOT Automatically Backed Up

### Supabase Storage Files
- Storage buckets are **separate** from database backups
- Contact Supabase support for storage recovery
- Consider periodic manual export for critical files

### Environment Secrets
- Keep secure copy of all secrets in password manager
- Document in secure location (not in git)

### External Service Credentials
- Anthropic API key
- VAPID keys
- Any future third-party integrations

---

## 7. Regular Verification Schedule

| Task | Frequency | Owner |
|------|-----------|-------|
| Verify backups exist in dashboard | Monthly | Admin |
| Test restore to branch | Quarterly | Admin |
| Review/rotate secrets | Annually | Admin |
| Update this document | After changes | Dev |

---

## 8. Contact Information

### Supabase Support
- **Dashboard**: https://supabase.com/dashboard
- **Support**: support@supabase.com
- **Status**: https://status.supabase.com

### Vercel Support
- **Dashboard**: https://vercel.com/dashboard
- **Status**: https://www.vercel-status.com

### Anthropic (Claude API)
- **Console**: https://console.anthropic.com
- **Support**: support@anthropic.com
