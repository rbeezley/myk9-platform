-- Keep requester-created onboarding rows in the admin queue's safe initial state.
-- The owner insert policy must not allow a client to set an admin workflow status
-- or write the private notes column.

begin;

alter table public.onboarding_requests
  drop constraint if exists onboarding_requests_status_check;

alter table public.onboarding_requests
  add constraint onboarding_requests_status_check
  check (status in ('pending', 'contacted', 'onboarded', 'declined'));

drop policy if exists "Authenticated users can submit onboarding request"
  on public.onboarding_requests;

create policy "Authenticated users can submit onboarding request"
  on public.onboarding_requests
  for insert
  to authenticated
  with check (
    auth.uid() = auth_user_id
    and status = 'pending'
    and notes is null
  );

commit;
