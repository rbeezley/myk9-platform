## Context

The existing `NotificationSettings.tsx` stores local notification behavior in Zustand and mirrors only `lead_dogs` and `push_enabled` through `notificationPreferenceSync.ts`. Migration `20260816140000_sms_consent_record.sql` already added the per-user consent columns and constraints. `supabase/functions/_shared/sms/smsMessage.ts` already provides E.164 normalization, GSM-7 validation, and the proximity builder, but nothing imports it outside tests. No provider client or SMS edge function exists.

The exhibitor intent is “This respects my time.” The UI therefore consolidates the existing notification master/push controls into one understandable Ring alerts card rather than introducing a second settings page or peer feature. SMS configuration is online-only account/integration data. It is not persistent show-day data and does not bypass or change `@myk9/replication`.

## Goals / Non-Goals

**Goals:**

- Make consent explicit, defensible, per-number, per-user, and reconstructable.
- Make the top-level off state stop both push and text without implying that an in-app text toggle is the same as carrier STOP.
- Put provider credentials and network calls exclusively in edge functions.
- Fail closed when provider configuration or webhook authentication is absent.
- Preserve one SMS per entry and one GSM-7 segment per alert.

**Non-Goals:**

- Checkout consent capture, per-show consent, marketing/result/schedule SMS, or a new settings surface.
- Offline SMS preference changes; this account-level integration requires connectivity and shows a calm retryable error.
- Secret creation, Twilio registration, function deploy, database push, or handset proof by an agent.

## Decisions

### 1. Keep one Notification Settings surface and model Ring alerts above delivery channels

`NotificationSettings.tsx` will replace the ambiguous generic notification master/push peer shape with a Ring alerts card backed by `upcoming_runs` for the outer server-visible switch and independent `push_enabled` / `sms_enabled` delivery controls. Sound, vibration, haptic, and voice remain their existing local behaviors outside the Ring alerts delivery choices.

Alternative considered: a second SMS page or a peer “SMS alerts” feature. Rejected because it duplicates the existing account setting and makes “off” ambiguous.

### 2. Treat the consented SMS number as the number on file

The settings service reads the single `notification_preferences` row keyed by `auth_user_id`. A record is valid only when the normalized input equals `sms_phone_e164`, the opt-in timestamp/version/source are present, and `sms_opt_out_at` is null. Valid same-number consent suppresses the checkbox even when in-app SMS delivery is off. Editing the number clears `sms_enabled` and every consent field before fresh consent is accepted.

Alternative considered: reuse `people.phone`. Rejected because consent is legally attached to the exact number and the schema deliberately pins it separately.

### 3. One authenticated opt-in edge-function call owns record creation and confirmation

The browser calls `sms-opt-in` with the raw phone number, consent version, and capture source. The function authenticates the JWT, derives `auth_user_id` only from that verified identity, normalizes and validates the number, validates the supported source, loads provider configuration before writing, and upserts all consent fields plus `sms_enabled=true` in one database statement. It then sends the exact confirmation text. If an already-active, complete record matches the same normalized number/version/source, the handler returns the current state without writing or sending a duplicate confirmation. If provider delivery fails after the write, it compensates by clearing the consent fields and disabling SMS so the UI must capture fresh consent rather than silently retaining an incomplete opt-in. **[EXPANDED after plan audit]**

Alternative considered: browser upsert followed by a separate send invocation. Rejected because partial client failure can leave an enabled record without the confirmation described in the carrier filing.

### 4. Use a provider interface with a small Twilio REST implementation

`_shared/sms/smsProvider.ts` defines the send contract. `twilioSmsProvider.ts` uses Twilio’s REST endpoint with Basic authentication and `MessagingServiceSid`; no SDK dependency is added. Configuration uses `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID`. Missing or empty configuration throws before database mutation or delivery.

This interface becomes the reviewed input for MYK9-193. MYK9-192 extends the same shared SMS area for signature verification but does not expose secrets to the client.

### 5. Serialize STOP/HELP before recurring delivery

MYK9-192 adds a fail-closed inbound webhook with Twilio HMAC-SHA1 verification, canonical STOP-family matching, HELP response, and carrier opt-out state. STOP mutes `upcoming_runs` as well as SMS so both channels stop; settings distinguishes carrier STOP from the reversible in-app SMS delivery switch. START does not manufacture consent.

MYK9-193 then removes the push-only early exit, computes channel decisions per recipient, filters opted-out rows, sends push and SMS as siblings with `Promise.allSettled`, and persists a once-per-entry SMS sent marker before deployment.

### 6. Deployment remains operator-gated

Code and tests can merge before campaign approval, but functions must not deploy until MYK9-190 is approved and the three Twilio secret names are configured. No secret values are committed or handled by agents. The migration/deploy/handset proof remains incomplete until explicitly approved evidence is recorded.

## Risks / Trade-offs

- **[Provider accepts a message but the response is lost]** → Twilio may deliver while the function compensates and prompts consent again. Record the provider response identifier when a later delivery log is introduced; for MYK9-191, prefer fail-closed consent state over silently enabled SMS.
- **[Consent write succeeds but provider send fails]** → Clear the full consent record and `sms_enabled` in a compensating update; return a retryable error.
- **[Compensation itself fails]** → Log the failure with user id only (never phone/token), return failure, and leave deployment gated pending operational review.
- **[Settings load fails/offline]** → Keep SMS controls disabled and show a plain retryable message; do not infer consent from local storage.
- **[A number is edited accidentally]** → Clear server consent only when the edited value is committed/blurred and differs after normalization; the UI immediately requires a fresh unchecked consent action.
- **[Concurrent settings writes]** → Each operation upserts only the columns it owns; the opt-in statement remains atomic and keyed by `auth_user_id`.
- **[Authenticated caller repeats or scripts opt-in]** → Ignore any caller-supplied identity and treat complete same-number/version/source consent as idempotent, without another provider send. **[ADDED after plan audit]**
- **[Twilio secret missing]** → The provider factory fails before any write or network call; no silent skip is reported as success.
- **[A recurring trigger retries]** → MYK9-193 must persist its sent marker and prove one SMS per entry before enabling delivery.

## Migration Plan

1. Merge MYK9-191 code/tests with the edge function undeployed; rollback is a normal commit revert because the consent schema already exists.
2. Merge MYK9-192 and its webhook tests, still undeployed.
3. Add MYK9-193’s sent-marker migration using a timestamp rechecked against current `origin/main`, explicit grants/revokes, and migration-auditor verification.
4. After MYK9-190 approval, operator configures the three Twilio secrets, applies any approved migration, and deploys with `--no-verify-jwt` because functions authenticate internally.
5. Record end-to-end handset evidence before declaring Lane 2B complete. Disable/rollback by undeploying or reverting the functions and keeping `sms_enabled` false; carrier STOP remains the delivery backstop.

## Open Questions

- No MYK9-191 product decision remains. A future delivery log/provider-message-id field may reduce the ambiguous network-response risk, but it is outside the issue’s acceptance criteria.
