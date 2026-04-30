-- Migration 177: Add missing auth.identities rows for test exhibitor accounts
--
-- Migration 152 inserted exhibitor1-5 into auth.users but omitted the required
-- auth.identities row. Without it, GoTrue returns "Database error querying
-- schema" on every sign-in attempt instead of "Invalid login credentials".
--
-- Matches the identity_data shape used by real email-provider rows.
-- Idempotent: ON CONFLICT (provider_id, provider) DO NOTHING.

DO $$
DECLARE
  v_users jsonb := '[
    {"auth_id":"a1000001-0000-0000-0000-000000000001","email":"exhibitor1@myk9t.com","first":"Alice","last":"Martin"},
    {"auth_id":"a1000002-0000-0000-0000-000000000002","email":"exhibitor2@myk9t.com","first":"Bob","last":"Chen"},
    {"auth_id":"a1000003-0000-0000-0000-000000000003","email":"exhibitor3@myk9t.com","first":"Carol","last":"Davis"},
    {"auth_id":"a1000004-0000-0000-0000-000000000004","email":"exhibitor4@myk9t.com","first":"Dan","last":"Okafor"},
    {"auth_id":"a1000005-0000-0000-0000-000000000005","email":"exhibitor5@myk9t.com","first":"Eva","last":"Torres"}
  ]';
  v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_users) LOOP
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      provider,
      identity_data,
      created_at,
      updated_at,
      last_sign_in_at
    ) VALUES (
      gen_random_uuid(),
      (v_item->>'auth_id')::uuid,
      v_item->>'auth_id',
      'email',
      jsonb_build_object(
        'sub',            v_item->>'auth_id',
        'email',          v_item->>'email',
        'email_verified', false,
        'phone_verified', false,
        'first_name',     v_item->>'first',
        'last_name',      v_item->>'last'
      ),
      now(),
      now(),
      now()
    )
    ON CONFLICT (provider_id, provider) DO NOTHING;
  END LOOP;
END $$;
