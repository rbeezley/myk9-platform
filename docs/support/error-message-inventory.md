# Error Message Inventory

User-facing strings a customer might quote to support. Organized by what triggers them. Look up the verbatim phrase to route the customer to the right answer or macro quickly.

**How to use:** Ctrl+F the exact phrase the customer quoted → find its row → follow the Action column.

**Sourced from:** codebase grep of `apps/myk9show/src/` (2026-06-19). Strings marked ⚠️ may churn as the UI evolves — re-verify during Phase 6.

**Full raw inventory:** The grep agent captured 300+ strings including internal/admin-only toasts. This file curates the subset a customer would quote to support. The full list is available in the agent transcript for reference.

---

## Cart and Checkout

| String | Where | Trigger | User action | Support checks |
|---|---|---|---|---|
| "Your cart has expired" | Cart page | Cart timeout (Stripe session) | Re-select classes and check out again | Check whether payment was captured before expiry: Stripe Dashboard → Payments |
| "Something went wrong starting checkout. Please try again." | Cart page | Stripe session creation failed | Try again; if persists, try a different browser | Check Stripe Dashboard → Payments for failed session; may be a payment method issue |

---

## Entry and Registration

| String | Where | Trigger | User action | Support checks |
|---|---|---|---|---|
| "Entry created successfully" | Secretary / walk-in | Manual entry creation | No action needed | — |
| "Entry added to waitlist" | Secretary / walk-in | Class is full | Exhibitor is on the waitlist | Check entries table: `status = 'waitlisted'` |
| "Entry pulled" | Show desk | Entry pulled from class | No action needed | Verify `entries.status = 'pulled'` if exhibitor is confused |
| "Entry promoted from waitlist" | Waitlist management | Waitlist spot offered and accepted | No action needed | — |
| "No email address on file for this exhibitor." | Entry management | Secretary tried to send decision email | Contact exhibitor by other means | Check `people.email` in Supabase; update if wrong |
| "Removed [dog] from [class]" | Entry management | Secretary removed an entry | Entry is gone from that class | Check `entries.deleted_at` if exhibitor disputes |
| "Some entries failed" | Bulk entry creation | Partial batch failure during walk-in entry | Retry failed entries individually | Check entries table for which ones are missing |

---

## Payment Status Labels

These appear as badges on entries, not as toast messages.

| String | Where | What it means | User action | Support checks |
|---|---|---|---|---|
| "Pending" | My Entries, Entry Management | Payment received; awaiting secretary review | Wait for secretary to approve | Check `entries.status`; normal state |
| "Payment Refunded" | My Entries | Entry was refunded | No action needed | Check `stripe_orders.status`; verify refund in Stripe |
| "Registration #Pending" | My Entries (terminal entries) | Known bug P-02 — shows on withdrawn entries | File as bug; do not document as expected | Known gap in `OPEN-TODOS.md` P1-04w-1 |

---

## App / Connectivity

| String | Where | Trigger | User action | Support checks |
|---|---|---|---|---|
| "You are offline" | Toast / banner | Network lost | Expected at venue; wait for connection | If at home: cache clear; if server-side: check Supabase status |
| "Your changes will be saved and synced when connection is restored." | Offline toast | Network lost while writing | Data is safe locally; will sync | No action needed unless still offline after connection restores |
| "Failed to save [N] change(s)." | Sync failure toast | Replication write failed | Retry using the Retry button | Check Supabase status; then escalate to engineering |
| "Failed to load data from server." | Sync failure toast | Replication download failed | Reload the page when back online | Check Supabase status |
| "This record was changed elsewhere" | Conflict toast | Two devices edited the same row | Choose "Take theirs" or "Keep mine" | Explain conflict resolution; no data is lost with either choice |
| "Resyncing local data..." | Loading indicator | Manual sync or recovery after offline | Wait for completion | If it never resolves, cache clear may be needed |

---

## Sign-In and Account

| String | Where | Trigger | User action | Support checks |
|---|---|---|---|---|
| "Please enter a valid email address" | Sign-in form | Malformed email | Correct the email | Check `people.email` if they believe the address is right |
| "Something went wrong. Please try again." | Sign-in / onboarding | Auth error | Try again; if persists, report to support | Check Supabase → Authentication → Users for account state |

---

## Dog and Profile

| String | Where | Trigger | User action | Support checks |
|---|---|---|---|---|
| "Please enter a call name" | Add dog form | Required field missing | Fill in the call name | — |
| "Date of birth cannot be in the future" | Add dog form | Invalid date | Correct the date | — |
| "Microchip must be 9-20 alphanumeric characters" | Add dog form | Invalid microchip format | Correct the microchip number | — |
| "Photo is too large" / "Photo must be an image" | Dog photo upload | File too big or wrong type | Use a JPEG/PNG under 5MB | — |
| "Failed to read the image file" | Dog photo upload | Corrupt or unreadable file | Try a different photo | — |
| "This person still owns dogs. Delete those dogs first." | Person deletion | Person has live dogs | Delete dogs first, then the person | Triggered by MK001 guard (migration 20260617130000) |

---

## Secretary — Show Setup and Configuration

| String | Where | Trigger | User action | Support checks |
|---|---|---|---|---|
| "Please enter a show name" | Show creation | Required field missing | Fill in the show name | — |
| "Please select a hosting club" | Show creation | No club selected | Select a club | Check whether secretary has a club role assigned |
| "Entry close date must be before show start date" | Show creation | Date logic error | Correct the dates | — |
| "Wait for shared show content to finish before publishing to exhibitors" | Show publishing | Premium PDF still generating | Wait, then retry publishing | Long-generation is expected; backend job completing |
| "Could not check the club's payment account. Please try again." | Show publishing | Stripe Connect check failed | Wait and retry | Check if club has a connected Stripe account |
| "Failed to update show status. Please try again." | Show status pill | Mutation failure | Retry | Check network; if persists, check Supabase |

---

## Secretary — Show Day

| String | Where | Trigger | User action | Support checks |
|---|---|---|---|---|
| "Entry moved up" | Show desk | Move-up completed | No action needed | — |
| "Entry marked pulled" | Show desk | Entry pulled from run order | Check if exhibitor expected this | Check `entries.status` |
| "Move-up undone" | Show desk | Move-up reversed | No action needed | — |
| "Failed to approve pull request" / "Failed to deny pull request" | Pull tab | Mutation failure | Retry | Check network; then Supabase |
| "Target class is full. Consider adding to waitlist." | Move-up tab | Class at capacity | Add to waitlist instead, or increase class capacity | Check `classes.max_entries` |
| "Spot offered, but the in-app notification couldn't be sent." | Waitlist | Push notification failed | Offer was sent; notification did not arrive | Email or call the exhibitor directly; push is best-effort |
| "Add a title and message before sending" | Announcement compose | Empty message | Fill in both fields | — |
| "No exhibitors are entered in that class yet" | Announcement compose | Sending to an empty class | Select a different class or send to all | — |

---

## Secretary — Reports

| String | Where | Trigger | User action | Support checks |
|---|---|---|---|---|
| "Select a trial before downloading the official PDF" | Reports page | No trial selected | Select a trial from the dropdown | — |
| "Could not download the official PDF" | Reports page | PDF generation failed | Retry; check browser pop-up blocker | If persists, check whether all required data exists for the trial |
| "No entries found for this selection" | Report preview | Filters too narrow or empty trial | Adjust filters | — |
| "Failed to copy to clipboard" | Class creation export | Clipboard permission denied | Grant clipboard permission in browser settings | — |

---

## Exhibitor-Facing

| String | Where | Trigger | User action | Support checks |
|---|---|---|---|---|
| "No entries match your search criteria" | Check-in entry list | Name search returned nothing | Clear the search and scroll | Check whether check-in is enabled for this show |
| "No entries found" | My Shows, My Entries | No entries exist for this user | Verify they entered under the correct account | Check `entries` table by person_id |
| "No shows scheduled" | Upcoming shows | No shows in the future for this club | Expected if club has no upcoming shows | Check show dates and published status |
| "Could not load your payments." | Exhibitor payments page | API load failure | Reload; if persists, report to support | Check Supabase for `stripe_orders` query errors |
| "Unable to share results" | Live results share | Clipboard or Web Share API error | Screenshot and share manually | — |

---

## Generic System Errors

These appear when a specific cause was not surfaced. Always ask the customer if they can reproduce the exact error text.

| String | Likely cause | User action | Support checks |
|---|---|---|---|
| "Something went wrong" | Uncaught exception | Reload the page; try again | Check browser console (F12 → Console) for a more specific error; escalate to engineering with steps to reproduce |
| "Something went wrong. Please try again." | Mutation or form submission failure | Retry; if persists, report | Same as above |
| "Operation failed. Please try again." | Database mutation error | Retry | Same as above |
| "You don't have permission to perform this action." | RLS policy block | Verify they have the right role | Check user roles in Supabase; may need a secretary/club-admin role assignment |
| "Cannot complete this action — it is referenced by other records." | Foreign key constraint | Delete dependent records first | Identify which related records block deletion |
| "This record already exists." | Duplicate key (23505) | Use the existing record instead | Find the duplicate in the relevant table |
| "Unable to reach the server. Please check your connection." | Network or Supabase down | Check connection; check status.supabase.com | If server-side: communicate status page ETA |

---

## Third-Party Strings (Stripe and PWA)

Strings that come from Stripe or the browser — myK9Show does not control their exact wording.

| String | Source | What it means | User action |
|---|---|---|---|
| "Under review" | Stripe Connect | Account undergoing identity verification | Complete the verification in Stripe Express (M-09) |
| "Verification required" | Stripe Connect | Missing identity documents | Follow Stripe email instructions |
| "Payout disabled" | Stripe Connect | Account not fully verified or restricted | Contact Stripe support with Connect account ID |
| "A new version of myK9Show is available" | PWA service worker | App update ready | Tap / click to reload and apply the update |
| [Browser offline indicator] | Browser | Device lost network | Reconnect to WiFi or mobile data |

---

## Strings to Re-Verify Before Phase 6 Publication ⚠️

These strings exist in the codebase but their exact wording or trigger conditions may change before launch:

- All generic `Failed to [verb] {entityName}` patterns — the `entityName` varies at runtime
- "Registration #Pending" label (bug P-02; may be fixed before launch)
- "This record was changed elsewhere" — wording may be revised in the conflict UI
- Waitlist notification failure message — wording tied to notification implementation
