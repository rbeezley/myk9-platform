# Pre-Show Checklist

**myK9Q v3 - Event Setup & Verification**

Use this checklist before each dog show to ensure the app is ready for production use.

---

## 1. Pre-Event Setup (1-2 Days Before)

### Database & Data
- [ ] Verify show data is imported correctly in Supabase
- [ ] Confirm all trials are created with correct dates
- [ ] Confirm all classes are created with correct elements/levels
- [ ] Verify entry data is imported (dog names, armbands, handlers)
- [ ] Test license key login works: `myK9Q1-[your-key]`
- [ ] Generate and distribute passcodes for all roles:
  - [ ] Admin passcodes (a####)
  - [ ] Judge passcodes (j####)
  - [ ] Steward passcodes (s####)
  - [ ] Exhibitor passcodes (e####)

### Infrastructure
- [ ] Verify Supabase project is on Pro plan (for reliability)
- [ ] Check Supabase dashboard for any service alerts
- [ ] Confirm Edge Functions are deployed (`ask-myk9q`, `validate-passcode`)
- [ ] Verify DNS/hosting is stable (if custom domain)

---

## 2. Device Preparation (Day Before)

### Judge/Steward Devices
- [ ] Install app to home screen (PWA) on each device
- [ ] Log in with appropriate passcode
- [ ] **Wait for initial sync to complete** (watch sync icon)
- [ ] Verify offline mode works:
  1. Enable airplane mode
  2. Navigate to a class entry list
  3. Confirm data is visible
  4. Disable airplane mode
- [ ] Test scoring workflow on a test entry (if available)
- [ ] Ensure device is charged (recommend 100% + backup battery)

### Network Setup
- [ ] Confirm venue has WiFi (preferred) or cellular coverage
- [ ] Test connection speed at venue (if possible)
- [ ] Have backup connectivity plan (mobile hotspot)
- [ ] Document WiFi credentials for judges/stewards

---

## 3. Morning-of Checks (Event Day)

### App Status
- [ ] Open app on admin device → Check sync icon shows green/connected
- [ ] Pull-to-refresh on Home page to force sync
- [ ] Verify entry counts match expected registration numbers
- [ ] Check class statuses are all "No Status" or "Setup"

### Judge Briefing Items
- [ ] Demonstrate scoresheet workflow
- [ ] Explain offline behavior: "Scores save locally and sync automatically"
- [ ] Show how to check sync status (tap sync icon in header)
- [ ] Remind: **Don't log out until sync is complete**
- [ ] Show "Call to Gate" functionality for stewards

### Exhibitor Communication
- [ ] Share show access URL/QR code
- [ ] Provide exhibitor passcode (or per-handler codes)
- [ ] Explain check-in process
- [ ] Point out "AskQ" help feature

---

## 4. During Event Monitoring

### Periodic Checks (Every 1-2 Hours)
- [ ] Check admin device sync status
- [ ] Review any failed sync notifications
- [ ] Spot-check a few scores in Supabase dashboard
- [ ] Monitor class completion progress

### Issue Response
- [ ] **If scores not syncing**: Check WiFi → Force refresh → Check pending count
- [ ] **If app frozen**: Close and reopen app (don't log out!)
- [ ] **If device lost/broken**: Log in on new device, scores from old device will sync when it comes online
- [ ] **If conflict reported**: Check audit log, verify correct score

---

## 5. End of Day / Event Close

### Before Closing
- [ ] Verify all classes show "Completed" status
- [ ] Confirm all scores have synced (pending count = 0 on all devices)
- [ ] Run placement calculations if needed
- [ ] Export results report from admin panel

### Data Verification
- [ ] Spot-check placements for accuracy
- [ ] Verify Q/NQ counts match expectations
- [ ] Check for any entries without scores (should be Absent/Pulled)
- [ ] Save/print final results

### Cleanup
- [ ] Download audit log export (if needed)
- [ ] Judges/Stewards can now log out safely
- [ ] Admin: Consider leaving logged in until results are finalized

---

## Emergency Contacts

| Role | Contact | Phone |
|------|---------|-------|
| App Support | [Your Name] | [Your Phone] |
| Show Secretary | | |
| Trial Chairman | | |

---

## Quick Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Can't log in | Wrong passcode | Verify passcode format (letter + 4 digits) |
| "Offline" showing | No network | Check WiFi/cellular, move to better coverage |
| Scores not appearing | Sync pending | Wait 30 sec, pull to refresh |
| Duplicate entries | Data import issue | Check Supabase, dedupe if needed |
| Can't log out | Pending scores | Wait for sync, check pending count |
| App crashes | Memory/cache | Force close, reopen, clear cache if persistent |

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-10 | 1.0 | Initial checklist created |

