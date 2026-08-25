-- Give the sms_proximity_sends.entry_id foreign key a leading index.
--
-- The primary key is (auth_user_id, entry_id), which is the exactly-once SMS
-- contract but cannot support an entry-only lookup or ON DELETE CASCADE from
-- entries. Keep that idempotency key unchanged and add only the missing access
-- path. The table is intentionally service-only and this migration changes no
-- grants, policies, functions, or replication behavior.

begin;

create index sms_proximity_sends_entry_id_idx
  on public.sms_proximity_sends (entry_id);

commit;
