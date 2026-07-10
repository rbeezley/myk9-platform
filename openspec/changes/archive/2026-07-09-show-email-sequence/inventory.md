## Implementation Inventory

Task 1.1 inventory completed before choosing lifecycle email table and function names.

### Existing Communication Surfaces

- `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx`
  owns `/secretary/messages?showId=...`, show filtering, thread selection, and message history.
- `apps/myk9show/src/components/notifications/MessageCenterPanel.tsx`
  opens message center tabs and routes staff users to `/secretary/messages?showId=...`.
- `apps/myk9show/src/features/show-workbench/MessageShowComposer.tsx`
  already links to the secretary message history for a show and sends show-wide or targeted messages.
- `apps/myk9show/src/features/show-workbench/messageShow.ts`
  contains existing show-message templates and recipient types.
- `apps/myk9show/src/hooks/mutations/useMessageMutations.ts`
  invokes `send-targeted-message` for exhibitor-facing show messages.

### Existing Entry Decision Paths

- `apps/myk9show/src/components/entries/management/RegistrationView.tsx`
  passes decision-email handlers into enrollment cards and refreshes email status.
- `apps/myk9show/src/components/entries/management/EnrollmentCard.tsx`
  exposes the current manual `Email Exhibitor` action for enrollment-level decisions.
- `apps/myk9show/src/components/entries/management/EnrollmentEmailDialog.tsx`
  is the existing editable secretary note dialog for decision emails.
- `apps/myk9show/src/hooks/useEntryManagementActions.ts`
  builds and invokes `send-email` with `type: 'entry_decision'`.
- `apps/myk9show/src/hooks/useEntryManagementData.ts`
  reads recent `email_log` rows for `entry_decision`.
- `apps/myk9show/src/components/entries/management/EntryRowActionMenu.tsx`
  has row-level Accept and Move to waitlist actions. Real waitlisting has a caveat: several local comments say bulk/status waitlist writes do not create true `waitlist_entries` membership. Lifecycle email prompts must respect the dedicated waitlist workflow.

### Existing Automatic Receipt Paths

- `apps/myk9show/src/store/showRegistrationStore.ts`
  invokes `send-registration-email` after online checkout confirmation.
- `apps/myk9show/src/components/shows/RegistrationWorkflow/sendRegistrationConfirmationEmail.ts`
  wraps the same edge function for the registration wizard and documents idempotency.
- `apps/myk9show/src/components/entries/management/RegistrationView.tsx`
  uses the same `send-registration-email` edge function for secretary resend.

### Existing Email Delivery And Audit

- `supabase/functions/send-registration-email/index.ts`
  renders registration confirmation, sends via Resend with `Idempotency-Key: registrationId`, and writes `email_log`.
- `supabase/functions/send-email/index.ts`
  sends generic emails including `entry_decision`; it writes `email_log` but currently has no stable Resend idempotency key.
- `supabase/functions/send-email/authz.ts`
  authorizes entry decision sends by enrollment show scope and show official roles.
- `supabase/functions/send-targeted-message/targeted-message-handler.ts`
  resolves show-scoped recipients server-side and writes in-app `show_messages`.
- `supabase/functions/resend-webhook/index.ts`
  updates `email_log.status` by `resend_message_id` for delivered, bounced, complained, and delayed events.
- `supabase/migrations/061_email_log_and_confirmation_message.sql`
  creates `email_log` and the original select policy for show secretaries.
- `supabase/migrations/084_security_sa008_email_log_service_role.sql`
  restricts `email_log` inserts to service role.
- `supabase/migrations/106_show_messages.sql`
  creates message threads/messages and RLS for message history.
- `supabase/migrations/192_heritage_trial_pages.sql`
  adds entry-level confirmation email status fields and documents Resend webhook linkage.

### Generated Types

- Canonical generated database types live in `packages/supabase/src/types/database.types.ts`.
- `apps/myk9show/src/types/supabase.ts` re-exports the package types.
- `email_log`, `show_message_threads`, `show_messages`, `entries`, `enrollments`, `shows`, `classes`, and `trials` are present in generated types.
- `apps/myk9show/src/hooks/useEmailStatus.ts` still has a legacy `as any` cast even though `email_log` is generated.

### Naming Decision From Inventory

Use explicit lifecycle names that do not collide with existing in-app messages:

- `show_lifecycle_email_steps` for per-show step settings.
- `show_lifecycle_email_jobs` for one reviewed email/batch-recipient job.
- `show_lifecycle_email_attempts` for delivery attempts tied to jobs and `email_log`.

The names make the boundary clear: `show_messages` remains in-app conversation history; `email_log` remains delivery audit; lifecycle tables answer what is ready, skipped, sent, failed, dismissed, or corrected for a show.
