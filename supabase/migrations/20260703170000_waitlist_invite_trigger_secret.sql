begin;

create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_net with schema net;

create or replace function public.notify_waitlist_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  edge_function_base_url text;
  invite_secret text;
begin
  if new.role <> 'club_official' then
    return new;
  end if;

  select decrypted_secret
  into edge_function_base_url
  from vault.decrypted_secrets
  where name = 'edge_function_base_url';

  select decrypted_secret
  into invite_secret
  from vault.decrypted_secrets
  where name = 'waitlist_invite_secret';

  if edge_function_base_url is null or invite_secret is null then
    raise notice 'Skipping waitlist invite: edge_function_base_url or waitlist_invite_secret is not configured';
    return new;
  end if;

  perform net.http_post(
    url := edge_function_base_url || '/send-waitlist-invite',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-myk9-waitlist-invite-secret', invite_secret
    ),
    body := jsonb_build_object('email', new.email)
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_waitlist_invite on public.platform_waitlist;

create trigger trg_notify_waitlist_invite
after insert on public.platform_waitlist
for each row
when (new.role = 'club_official')
execute function public.notify_waitlist_invite();

commit;
