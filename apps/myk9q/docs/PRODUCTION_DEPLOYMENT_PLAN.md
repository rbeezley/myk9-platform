# myK9Q Production Deployment Plan

**Goal:** Deploy myK9Q to production at `myK9Q.com` while keeping `app.myK9Q.com` as staging
**Target Date:** Before next weekend's club trial
**Status:** ✅ COMPLETED - January 2, 2026

---

## Overview

| Environment | Domain | Branch | Purpose |
|-------------|--------|--------|---------|
| **Production** | myK9Q.com | `main` | Live site for clubs |
| **Staging** | app.myK9Q.com | `develop` | Testing before production |

---

## Phase 1: Code Updates (Priority - Do First)

### 1.1 Edge Functions - CORS Updates

- [x] **send-push-notification/index.ts**
  - Added dynamic CORS with `myk9q.com`, `www.myk9q.com`, `app.myk9q.com`

- [x] **search-rules-v2/index.ts**
  - Added `"https://myk9q.com"`, `"https://www.myk9q.com"` to ALLOWED_ORIGINS

- [x] **ask-myk9q/index.ts**
  - Added `"https://myk9q.com"`, `"https://www.myk9q.com"` to ALLOWED_ORIGINS
  - Also fixed date-scoping bug in AI responses

- [x] **validate-passcode/index.ts**
  - Left as wildcard `*` (intentional decision)

### 1.2 Deploy Updated Edge Functions
- [x] Deploy `send-push-notification` to Supabase
- [x] Deploy `search-rules-v2` to Supabase
- [x] Deploy `ask-myk9q` to Supabase

### 1.3 Test Configuration Updates (Optional - for future E2E testing)
- [ ] Update `playwright.prod.config.ts` line 26 to use environment variable
- [ ] Update `stress_tests/playwright.config.js` (lines 67, 75, 84)

---

## Phase 2: Vercel Configuration

### 2.1 Add Production Domain
- [x] Log into Vercel Dashboard (vercel.com)
- [x] Navigate to your myK9Q project
- [x] Go to **Settings** → **Domains**
- [x] Add `myk9q.com`
- [x] Add `www.myk9q.com` (redirects to apex)

### 2.2 Configure Domain Assignments
- [x] Set `myk9q.com` → Production (main branch)
- [x] Set `www.myk9q.com` → 307 Redirect to `myk9q.com`
- [x] Set `app.myk9q.com` → Preview (`develop` branch) for staging

### 2.3 Verify Environment Variables
- [x] Environment variables already configured from previous deployment

---

## Phase 3: DNS Configuration (Hostinger)

### 3.1 Backup Current DNS
- N/A - WordPress site replaced entirely, no email

### 3.2 Option A: Use Vercel Nameservers (Recommended) ✅ USED
- [x] In Hostinger, go to DNS/Nameservers settings
- [x] Changed nameservers to Vercel's:
  - `ns1.vercel-dns.com`
  - `ns2.vercel-dns.com`

### 3.3 Preserve Email Records
- N/A - No email on this domain

---

## Phase 4: Verification & Testing

### 4.1 Wait for DNS Propagation
- [x] Checked propagation status at: https://dnschecker.org
- [x] DNS propagated globally to Vercel IPs
- Note: Local ISP DNS required Google DNS (8.8.8.8) temporarily

### 4.2 Verify SSL Certificate
- [x] Visit https://myk9q.com - valid SSL (padlock)

### 4.3 Functional Testing on Production Domain
- [x] Landing page loads at https://myk9q.com
- [x] Login works (passcode validation)
- [x] AskQ chatbot works (rules search, AI responses)
- [ ] Push notifications work (blocked in incognito - expected)
- [ ] Offline mode works
- [ ] PWA install prompt appears

### 4.4 Cross-Browser Testing
- [x] Chrome desktop
- [ ] Safari desktop
- [ ] Chrome mobile (Android)
- [ ] Safari mobile (iOS)

---

## Phase 5: PWA & Notifications

### 5.1 Service Worker Verification
- [ ] Clear browser cache and revisit https://myk9q.com
- [ ] Verify service worker registers successfully
- [ ] Verify manifest loads correctly

### 5.2 Push Notification Testing
- [ ] Subscribe to notifications on production domain (use non-incognito)
- [ ] Send test notification to verify delivery

---

## Phase 6: Documentation Updates

- [x] Update `docs/DISASTER_RECOVERY.md` - added production/staging domains, added missing edge functions
- [x] Update `CLAUDE.md` with deployment workflow (develop → staging, main → production)
- [ ] Update `README.md` with production URL (optional)

---

## Phase 7: WordPress Site Migration

- [x] WordPress replaced entirely - no migration needed

---

## Rollback Plan

If something goes wrong:

### Immediate Rollback (DNS)
1. Revert nameservers to Hostinger's original nameservers
2. DNS will propagate back (may take time)

### Vercel Rollback
1. In Vercel Dashboard → Deployments
2. Click "..." on previous working deployment
3. Select "Promote to Production"

---

## Post-Launch Checklist (Day of Club Trial)

### Morning of Event
- [ ] Verify https://myk9q.com loads correctly
- [ ] Test login with admin passcode
- [ ] Verify show data is accessible
- [ ] Test offline mode on a phone

### During Event
- [ ] Monitor for any error reports
- [ ] Have staging site (app.myk9q.com) ready as backup

### After Event
- [ ] Collect feedback from club users
- [ ] Review any error logs in Supabase
- [ ] Document any issues for future improvements

---

## Final Domain Configuration

| Domain | Configuration | Branch |
|--------|---------------|--------|
| myk9q.com | Production | `main` |
| www.myk9q.com | 307 Redirect → myk9q.com | - |
| app.myk9q.com | Staging | `develop` |
| my-k9-q-react.vercel.app | Production (backup) | `main` |

---

## Support Resources

- Vercel Docs: https://vercel.com/docs/projects/domains
- DNS Propagation Check: https://dnschecker.org
- Supabase Edge Functions: https://supabase.com/docs/guides/functions

---

*Plan created: January 2, 2026*
*Deployment completed: January 2, 2026*
