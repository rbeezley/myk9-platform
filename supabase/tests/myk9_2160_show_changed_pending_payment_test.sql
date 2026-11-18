-- MYK9-2160: a show date change emails an exhibitor whose waitlist offer is awaiting payment.
--
--   A. a date change queues a job for the owner of a 'pending-payment' entry, and the sender's
--      send-time check still counts them; a withdrawn entry's owner gets neither
--
-- Fixtures roll back.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002160301', 'MYK9-2160 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status, venue_name, address, city) values
  ('00000000-0000-0000-0000-000002160302', 'MYK9-2160 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002160301', 'published', 'Old Barn', '1 Old Road', 'Oldtown');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002160303', '00000000-0000-0000-0000-000002160302', 'MYK9-2160 Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002160304', '00000000-0000-0000-0000-000002160303', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');
insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002160321', 'Olive', 'Offered', 'olive@example.test'),
  ('00000000-0000-0000-0000-000002160326', 'Cy', 'Withdrew', 'cy2160@example.test');
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002160331', 'Olive Dog', 'Ol', 'Beagle', '00000000-0000-0000-0000-000002160321'),
  ('00000000-0000-0000-0000-000002160334', 'Cy Dog', 'Cy', 'Beagle', '00000000-0000-0000-0000-000002160326');

alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002160341', '00000000-0000-0000-0000-000002160331', '00000000-0000-0000-0000-000002160304', '00000000-0000-0000-0000-000002160302', '00000000-0000-0000-0000-000002160303', null, 'pending-payment', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002160344', '00000000-0000-0000-0000-000002160334', '00000000-0000-0000-0000-000002160304', '00000000-0000-0000-0000-000002160302', '00000000-0000-0000-0000-000002160303', null, 'withdrawn', '2', 2, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

-- A
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002160302';
  v_offered uuid := '00000000-0000-0000-0000-000002160321';
  v_withdrew uuid := '00000000-0000-0000-0000-000002160326';
begin
  update public.trials set date = current_date + 7 where id = '00000000-0000-0000-0000-000002160303';
  if not exists (select 1 from public.show_lifecycle_email_jobs
                  where show_id = v_show and step_type = 'show_changed' and status = 'ready'
                    and recipient_person_id = v_offered and recipient_email = 'olive@example.test') then
    raise exception 'FAIL A an exhibitor whose waitlist offer awaits payment was not queued';
  end if;
  if exists (select 1 from public.show_lifecycle_email_jobs
              where show_id = v_show and step_type = 'show_changed' and recipient_person_id = v_withdrew) then
    raise exception 'FAIL A an exhibitor whose only dog withdrew was queued';
  end if;
  if not public.show_person_has_live_entry(v_show, v_offered) then
    raise exception 'FAIL A the send-time check dropped an exhibitor with an offer awaiting payment';
  end if;
  if public.show_person_has_live_entry(v_show, v_withdrew) then
    raise exception 'FAIL A the send-time check kept an exhibitor whose only dog withdrew';
  end if;
  raise notice 'PASS A a date change reaches an offered, unpaid entry';
end $$;

rollback;
