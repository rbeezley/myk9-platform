-- MYK9-135 behavioural contract: the support-triage auto-send guard is atomic.
--
-- The TypeScript caller can only ever assert that it ASKED the database not to
-- duplicate. Whether the database actually refuses is a property of
-- public.support_triage_send_operator_reply, and only a SQL test can hold it.
--
-- The positive cases are load-bearing. A function that returned false
-- unconditionally would satisfy every "does not duplicate" assertion below and
-- would ship a support agent that never answers anything, so each refusal is
-- paired with a send that must still succeed.
--
-- All fixtures roll back.

BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  (
    '00000000-0000-0000-0000-000000135101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-135-exhibitor@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  ),
  (
    '00000000-0000-0000-0000-000000135102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-135-operator@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  );

INSERT INTO public.support_tickets (id, owner_id, subject, status)
VALUES
  (
    '00000000-0000-0000-0000-000000135201',
    '00000000-0000-0000-0000-000000135101',
    'MYK9-135 open ticket', 'open'
  ),
  (
    '00000000-0000-0000-0000-000000135202',
    '00000000-0000-0000-0000-000000135101',
    'MYK9-135 overtaken ticket', 'open'
  ),
  (
    '00000000-0000-0000-0000-000000135203',
    '00000000-0000-0000-0000-000000135101',
    'MYK9-135 resolved ticket', 'resolved'
  ),
  (
    '00000000-0000-0000-0000-000000135204',
    '00000000-0000-0000-0000-000000135101',
    'MYK9-135 ambiguous ticket', 'open'
  );

-- Explicit created_at values, because now() is frozen for the whole transaction
-- and the guard compares timestamps.
INSERT INTO public.support_ticket_messages (
  id, ticket_id, sender_id, body, is_from_operator, created_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000135301',
    '00000000-0000-0000-0000-000000135201',
    '00000000-0000-0000-0000-000000135101',
    'Where do I find my armband number?', false, now() - interval '10 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000135302',
    '00000000-0000-0000-0000-000000135202',
    '00000000-0000-0000-0000-000000135101',
    'Where do I find my armband number?', false, now() - interval '10 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000135303',
    '00000000-0000-0000-0000-000000135203',
    '00000000-0000-0000-0000-000000135101',
    'Where do I find my armband number?', false, now() - interval '10 minutes'
  ),
  -- Two exhibitor messages sharing a created_at: which one is "newest" is
  -- undefined, so the guard must refuse rather than guess.
  (
    '00000000-0000-0000-0000-000000135304',
    '00000000-0000-0000-0000-000000135204',
    '00000000-0000-0000-0000-000000135101',
    'Where do I find my armband number?', false, now() - interval '10 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000135305',
    '00000000-0000-0000-0000-000000135204',
    '00000000-0000-0000-0000-000000135101',
    'Sorry, one more thing.', false, now() - interval '10 minutes'
  );

-- The triage worker authenticates with the service-role key, so every call below
-- is made as that role. Fixtures above ran as the owner.
SET LOCAL ROLE service_role;

DO $$
DECLARE
  open_ticket CONSTANT uuid := '00000000-0000-0000-0000-000000135201';
  overtaken_ticket CONSTANT uuid := '00000000-0000-0000-0000-000000135202';
  resolved_ticket CONSTANT uuid := '00000000-0000-0000-0000-000000135203';
  ambiguous_ticket CONSTANT uuid := '00000000-0000-0000-0000-000000135204';
  operator_id CONSTANT uuid := '00000000-0000-0000-0000-000000135102';
  open_message CONSTANT uuid := '00000000-0000-0000-0000-000000135301';
  overtaken_message CONSTANT uuid := '00000000-0000-0000-0000-000000135302';
  resolved_message CONSTANT uuid := '00000000-0000-0000-0000-000000135303';
  ambiguous_message CONSTANT uuid := '00000000-0000-0000-0000-000000135304';
  signature CONSTANT text :=
    'public.support_triage_send_operator_reply(uuid, uuid, text, uuid)';
  reply CONSTANT text := 'Open My Entries to see your armband number.';
  sent boolean;
  operator_replies integer;
  ticket_status text;
  late_message uuid;
  inserted_operator_message uuid;
BEGIN
  -- 1. Only the service role may write an operator-authored message this way.
  IF has_function_privilege('anon', signature, 'execute') THEN
    RAISE EXCEPTION 'FAIL anon can execute support_triage_send_operator_reply';
  END IF;
  IF has_function_privilege('authenticated', signature, 'execute') THEN
    RAISE EXCEPTION 'FAIL authenticated can execute support_triage_send_operator_reply';
  END IF;
  IF NOT has_function_privilege('service_role', signature, 'execute') THEN
    RAISE EXCEPTION 'FAIL service_role lost execute on support_triage_send_operator_reply';
  END IF;

  -- 2. Happy path: the message we read is still the newest on an open ticket.
  sent := public.support_triage_send_operator_reply(
    open_ticket, operator_id, reply, open_message
  );
  IF sent IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL first send returned % (expected true)', sent;
  END IF;

  SELECT count(*) INTO operator_replies
  FROM public.support_ticket_messages
  WHERE ticket_id = open_ticket AND is_from_operator;
  IF operator_replies <> 1 THEN
    RAISE EXCEPTION 'FAIL expected exactly 1 operator reply after the send, found %',
      operator_replies;
  END IF;

  SELECT status INTO ticket_status FROM public.support_tickets WHERE id = open_ticket;
  IF ticket_status IS DISTINCT FROM 'waiting' THEN
    RAISE EXCEPTION 'FAIL ticket status is % after a send (expected waiting)', ticket_status;
  END IF;

  -- 3. The whole point of MYK9-135. A second caller holding the SAME expected
  -- message id — a duplicated worker, or a retry after a lost response — must
  -- no-op, because the reply from step 2 is now newer than what it read.
  sent := public.support_triage_send_operator_reply(
    open_ticket, operator_id, reply, open_message
  );
  IF sent IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL replay with a stale expected id returned % (expected false)', sent;
  END IF;

  SELECT count(*) INTO operator_replies
  FROM public.support_ticket_messages
  WHERE ticket_id = open_ticket AND is_from_operator;
  IF operator_replies <> 1 THEN
    RAISE EXCEPTION 'FAIL replay duplicated the operator reply, ticket now has %',
      operator_replies;
  END IF;

  -- 4. An expected id naming an OPERATOR message is never a valid anchor: the
  -- agent answers exhibitors, not itself.
  SELECT id INTO inserted_operator_message
  FROM public.support_ticket_messages
  WHERE ticket_id = open_ticket AND is_from_operator
  LIMIT 1;

  sent := public.support_triage_send_operator_reply(
    open_ticket, operator_id, reply, inserted_operator_message
  );
  IF sent IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL anchoring on an operator message returned % (expected false)', sent;
  END IF;

  -- 5. A human operator, or the exhibitor, wrote after our read. The insert must
  -- find no matching row.
  INSERT INTO public.support_ticket_messages (
    ticket_id, sender_id, body, is_from_operator, created_at
  )
  VALUES (
    overtaken_ticket,
    '00000000-0000-0000-0000-000000135101',
    'Actually, never mind — I found it.', false, now() - interval '1 minute'
  )
  RETURNING id INTO late_message;

  sent := public.support_triage_send_operator_reply(
    overtaken_ticket, operator_id, reply, overtaken_message
  );
  IF sent IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL overtaken thread returned % (expected false)', sent;
  END IF;

  SELECT count(*) INTO operator_replies
  FROM public.support_ticket_messages
  WHERE ticket_id = overtaken_ticket AND is_from_operator;
  IF operator_replies <> 0 THEN
    RAISE EXCEPTION 'FAIL overtaken thread received % operator replies', operator_replies;
  END IF;

  -- 5b. Control for step 5: re-anchored on the message that actually IS newest,
  -- the same ticket sends. Without this, an always-false function passes step 5.
  sent := public.support_triage_send_operator_reply(
    overtaken_ticket, operator_id, reply, late_message
  );
  IF sent IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL re-anchored send returned % (expected true)', sent;
  END IF;

  -- 6. An expected id from a DIFFERENT ticket must not authorise a send here.
  -- Deliberately aimed at open_ticket, which is still sendable ('waiting'), so
  -- the refusal can only come from the ticket_id check — aiming it at the
  -- resolved ticket would be answered by the status check in step 7 instead and
  -- prove nothing.
  sent := public.support_triage_send_operator_reply(
    open_ticket, operator_id, reply, overtaken_message
  );
  IF sent IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL cross-ticket expected id returned % (expected false)', sent;
  END IF;

  SELECT count(*) INTO operator_replies
  FROM public.support_ticket_messages
  WHERE ticket_id = open_ticket AND is_from_operator;
  IF operator_replies <> 1 THEN
    RAISE EXCEPTION 'FAIL cross-ticket call added a reply, ticket now has %', operator_replies;
  END IF;

  -- 7. A ticket the operator resolved while we were classifying. Answering it
  -- would silently re-open it.
  sent := public.support_triage_send_operator_reply(
    resolved_ticket, operator_id, reply, resolved_message
  );
  IF sent IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL resolved ticket returned % (expected false)', sent;
  END IF;

  SELECT status INTO ticket_status FROM public.support_tickets WHERE id = resolved_ticket;
  IF ticket_status IS DISTINCT FROM 'resolved' THEN
    RAISE EXCEPTION 'FAIL resolved ticket was moved to %', ticket_status;
  END IF;

  -- 8. Two messages sharing a created_at: "newest" is undefined, so refuse.
  sent := public.support_triage_send_operator_reply(
    ambiguous_ticket, operator_id, reply, ambiguous_message
  );
  IF sent IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL ambiguous thread returned % (expected false)', sent;
  END IF;

  -- 9. A ticket that does not exist at all.
  sent := public.support_triage_send_operator_reply(
    '00000000-0000-0000-0000-000000135299', operator_id, reply, open_message
  );
  IF sent IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL missing ticket returned % (expected false)', sent;
  END IF;

  RAISE NOTICE 'PASS MYK9-135 atomic auto-send: service-role only, no duplicate on replay, refuses overtaken, cross-ticket, operator-anchored, resolved, ambiguous and missing tickets, still sends when re-anchored';
END;
$$;

RESET ROLE;

ROLLBACK;
