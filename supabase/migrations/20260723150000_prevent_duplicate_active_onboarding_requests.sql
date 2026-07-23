-- A user may have only one onboarding request awaiting review at a time.
-- The client preflight remains useful for copy, but this index is the
-- authoritative boundary for concurrent tabs/devices.
create unique index if not exists idx_onboarding_requests_one_active_per_user
  on public.onboarding_requests (auth_user_id)
  where status in ('pending', 'contacted');
