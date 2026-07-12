# Dedicated Push Webhook Secret Evidence

**Checked:** 2026-07-12 UTC

**Shared-system mutation performed:** none

## Secret alignment

Read-only evidence proves that the existing secret is ready for fallback removal:

- Vault `push_webhook_secret` SHA-256: `1ee4…ae73`;
- Edge `PUSH_WEBHOOK_SECRET` SHA-256: `1ee4…ae73`; and
- Edge `SUPABASE_SERVICE_ROLE_KEY` has a different digest, so the rejection smoke is meaningful.

Only redacted digests were printed or recorded. The secret values were never written to repository
files or command output.

## Five-function inventory

| Edge Function                  | Deployed version before this slice | Live database caller                                            | Trigger table/event                   |
| ------------------------------ | ---------------------------------: | --------------------------------------------------------------- | ------------------------------------- |
| `push-trigger-announcement`    |                                 42 | `notify_announcement_push()` / `on_announcement_insert_push`    | `show_announcements` insert           |
| `push-trigger-chat-message`    |                                 36 | `notify_chat_message()` / `trg_notify_chat_message`             | `show_messages` insert                |
| `push-trigger-support-message` |                                  2 | `notify_support_message()` / `trg_notify_support_message`       | `support_ticket_messages` insert      |
| `push-trigger-class-status`    |                                 46 | `notify_class_status_push()` / `trg_notify_class_status_push`   | `classes.status` update               |
| `push-trigger-scoring`         |                                 45 | `notify_entry_scoring_push()` / `trg_notify_entry_scoring_push` | `entries.scoring_completed_at` update |

All five catalog triggers reported enabled. Each caller reads Vault `push_webhook_secret` and sends
it as the inbound bearer. Announcement, chat, and support now use the same shared constant-time
helper already used by class-status and scoring. The support function's one remaining
`SUPABASE_SERVICE_ROLE_KEY` read is downstream authorization to `send-push-notification`, not
inbound webhook authentication.

## RED / GREEN

RED produced seven expected failures: the shared helper accepted a service-role-only environment;
three inline handlers did not use the shared helper; announcement/chat still read the service-role
key; and support contained a second service-role read in its inbound path.

GREEN: 21 direct tests prove the exact dedicated secret succeeds, missing configuration returns
503, missing/wrong/wrong-length/service-role-only bearers fail before JSON parsing, all five
handlers authenticate before reading payloads, and support preserves only its legitimate
downstream bearer. The focused set has 33 passing tests including the shared HTTP envelope's
existing method, JWT, error, and body-parsing coverage.

## Approval-gated deployment and smoke manifest

No rotation is required for this rollout because the current Vault and Edge digests match. After
review and merge, recheck both digests, then run every command below. Do not deploy only the three
edited handlers: class-status and scoring bundle the changed shared helper and also require a new
revision.

```bash
supabase functions deploy push-trigger-announcement --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
supabase functions deploy push-trigger-chat-message --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
supabase functions deploy push-trigger-support-message --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
supabase functions deploy push-trigger-class-status --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
supabase functions deploy push-trigger-scoring --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
```

Run non-delivering authentication smokes against every deployed function:

1. dedicated-secret bearer: announcement uses a normal-priority inert record and returns
   `no_push_needed`; class-status and scoring use non-transition records and return `no_action`;
   chat and support use an empty record and reach their post-auth 400 validation response;
2. service-role bearer: every function returns 401 before payload handling; and
3. wrong-length bearer: every function returns 401 without a comparison error.

Then trigger one controlled, named test notification through the normal Vault-backed database path
only with explicit approval, verify the `pg_net` response and intended recipient, and remove any
test data through the approved fixture cleanup path.

## Rotation and rollback manifest

Rotation is needed only if the dedicated secret is suspected compromised or an operator elects to
rotate it. Schedule a no-write maintenance window because Edge secret and Vault updates are not
atomic across systems. Generate a high-entropy replacement outside the repository, update Edge
`PUSH_WEBHOOK_SECRET`, update the existing Vault row with
`vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text,
new_key_id uuid)`, recheck only the two SHA-256 digests, deploy all five functions, and run the
non-delivering smokes before resuming writes.

Elective-rotation rollback stops triggering writes, restores the still-trusted prior dedicated
secret to both Edge and the existing Vault row from the operator's secure recovery record, confirms
matching redacted digests, and re-runs the inert smokes before lifting the maintenance window. If
the prior secret may be compromised, never restore it: generate another fresh secret and repeat the
forward rotation instead.

The pre-remediation function revisions are not rollback-safe because they contain the forbidden
service-role fallback. A code rollback must use a hotfix revision derived from the prior function
logic but retaining `beforeBody: requirePushWebhookSecret` and the dedicated-secret-only helper.
After deploying that rollback-safe revision to all five functions, re-run the dedicated-secret and
service-role-rejection smokes. Never restore the fallback.

Runtime closure remains task 8.3: secret rotation/alignment if elected, five deployments, five
dedicated-secret smokes, five service-role rejection smokes, and one controlled Vault-path proof.

## OpenSpec implementation verification

| Dimension    | Result                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Completeness | Tasks 8.1 and 8.2 complete; task 8.3 correctly remains shared-system gated. The parent change is 17/47 complete. |
| Correctness  | Both push-authentication requirements and all five scenarios have implementation plus focused coverage.          |
| Coherence    | Follows the design's single shared constant-time helper and preserves the documented downstream support bearer.  |

The initial OpenSpec pass identified no artifact divergence. Independent review then found four
implementation/evidence gaps, all corrected before handoff: authentication now runs before JSON
parsing with runtime coverage; the manifest contains all five exact deploy commands; elective
rollback and compromised-secret recovery are separated without permitting the fallback; and stale
SA-025 merge tracking is corrected. The parent change is not archive-ready because its remaining
deployment, advisor, and operator tasks are intentionally open.
