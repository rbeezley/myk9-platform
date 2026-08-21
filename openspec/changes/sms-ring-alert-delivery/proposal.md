## Why

myK9Show has database columns and a pure proximity-message builder for SMS, but it has no consent capture, provider integration, opt-out handling, or send path. Lane 2B closes that compliance and delivery gap in a serialized change so the fall 2026 launch does not depend on carrier-filed behavior that the product cannot actually perform.

## What Changes

- Present ring alerts as one exhibitor feature with independently controlled push and text delivery options, while one outer switch clearly stops both channels.
- Capture explicit, unchecked, versioned SMS consent in Account → Notification Settings; normalize the consented number; persist one record per user; and require fresh consent when the number changes.
- Send the exact campaign confirmation through a fail-closed Twilio Messaging Service client after opt-in.
- Add authenticated inbound STOP/HELP handling that records carrier-level opt-out state and explains the difference from turning text delivery off in-app.
- Extend run-proximity delivery with per-recipient SMS decisions and durable once-per-entry idempotency.
- Keep deployment, Twilio secret configuration, campaign approval, and handset evidence behind explicit operator gates.

This change does not duplicate a page or workflow. Notification Settings is already the single account-level surface for notification preferences, and the 10DLC filing names that surface; a link to a new SMS page would fragment one feature and make the consent workflow harder to understand.

### Non-goals

- No checkout capture point, per-show consent record, marketing SMS, result SMS, or schedule-change SMS.
- No replacement of push delivery or recreation of deleted `apps/myk9q` behavior.
- No agent-managed Twilio registration, secret values, production deploy, database push, or handset proof.

## Capabilities

### New Capabilities

- `sms-ring-alert-delivery`: Explicit per-number consent, compliant confirmation and STOP/HELP behavior, unified ring-alert channel controls, and once-per-entry SMS delivery.

### Modified Capabilities

None.

## Impact

- `apps/myk9show`: existing Notification Settings UI, preference synchronization, focused component/service tests, and test allowlists.
- `supabase/functions`: provider-agnostic SMS helpers, Twilio REST delivery, opt-in confirmation endpoint, inbound webhook, and run-proximity delivery.
- `supabase/migrations`: only the later once-per-entry delivery marker/RPC work required by MYK9-193; MYK9-191 uses the already-applied consent schema.
- Operations: Twilio account SID, auth token, and Messaging Service SID must be configured by the operator; deploy remains blocked until MYK9-190 campaign approval.
- Offline impact: notification consent and provider delivery are explicitly online-only account settings/integration work; no replicated show-day data path is bypassed or changed.
