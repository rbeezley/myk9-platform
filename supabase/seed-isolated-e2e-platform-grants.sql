-- Local-only ACL normalization for the isolated Playwright target.
--
-- Hosted Supabase gives authenticated and service_role broad table privileges
-- before RLS applies. The local CLI's fresh database does not reproduce those
-- historical defaults for early migrations, so policies alone return 42501.
-- This allowlist mirrors the linked project's applied ACLs for tables exercised
-- by the curated suite. It deliberately avoids schema-wide grants and does not
-- change any RLS policy.

BEGIN;

GRANT ALL PRIVILEGES ON TABLE
  public.armbands,
  public.class_visibility_overrides,
  public.classes,
  public.clubs,
  public.dog_registrations,
  public.dogs,
  public.enrollments,
  public.entry_cart_items,
  public.entry_carts,
  public.exhibitor_profiles,
  public.judge_assignments,
  public.judge_qualifications,
  public.people,
  public.permissions,
  public.role_permissions,
  public.roles,
  public.secretary_tasks,
  public.show_announcements,
  public.show_message_threads,
  public.show_messages,
  public.show_templates,
  public.show_visibility_settings,
  public.shows,
  public.sport_class_rules,
  public.sport_templates,
  public.template_fields,
  public.trial_visibility_overrides,
  public.trials,
  public.user_roles,
  public.waitlist_entries
TO authenticated, service_role;

-- The applied hosted schema intentionally replaces authenticated's broad
-- entries SELECT with column grants in migration 20260620001929 and later
-- additions. Preserve those existing column grants while restoring the other
-- platform-default table privileges.
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.entries TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.entries TO service_role;

COMMIT;
