-- MYK9-1930: a day-of entry with no entry form gets one from the server, so its money can be
-- recorded with the form's existing controls (Paid in Full: Cash / Check, Partial Payment).
--
-- THE BUG. A secretary's desk late entry is a plain replicated INSERT into public.entries with
-- registration_id NULL (submitOfflineLateEntry). Entry Management offers Cash / Check only on an
-- entry form (public.enrollments), so a "Cash/Check (pay at show)" late entry could never be
-- marked paid. The same was true of every entry with no form behind it.
--
-- THE SHAPE (owner decision 2026-11-18). The SERVER attaches the form when the entry is written.
-- Nothing new is replicated and the device creates no form: a day-of entry still saves on the
-- device offline exactly as before, and gets its form when it syncs.
--
--   trg_zz_entries_attach_entry_form, BEFORE INSERT on entries. Finds the exhibitor's form for
--   the show (one per (show_id, handler_id), unique index idx_registrations_show_handler) or
--   creates it, and sets registration_id. The exhibitor is the dog's owner, the rule
--   sync_enrollment_on_payment_success and the wizard's createShowRegistration both use.
--   Named trg_zz_ so it runs after every other BEFORE INSERT trigger (Postgres fires them in
--   name order) and reads the row as they leave it: the fee after trg_entries_junior_fee, the
--   derived card_paid, the cleared comp memory.
--     Applies to an INSERT that arrives with:
--       registration_id NULL           an entry that already names a form (submit_show_entries,
--                                      create_online_paid_entry, a mail-in edit) is untouched;
--       deleted_at NULL, show_id and dog_id set;
--       no card marker                 stripe_payment_intent_id NULL, payment_method not
--                                      'online' (the card method; buildEntryInsert writes it)
--                                      nor 'credit_card', card_paid false. Card entries get
--                                      their form from the checkout sync
--                                      (sync_enrollment_on_payment_success);
--       not awaiting card payment      entry_status is not 'pending-payment', the status a
--                                      waitlist offer is created with ("Promoted from waitlist,
--                                      awaiting Stripe checkout", types/entry-lifecycle.ts). The
--                                      offer is paid by card and gets its form from the checkout
--                                      sync, whether the secretary made it (promote_waitlist_entry)
--                                      or the cron did;
--       moved_from_entry_id NULL       a move-up destination is money-neutral and inherits its
--                                      root's form (move_up_entry copies registration_id);
--       a caller who manages the show  public.can_manage_show(show_id), the very predicate the
--                                      entries_insert RLS policy checks (20260915194500): the
--                                      show's club admin or club-scoped secretary /
--                                      trial_secretary, or a platform admin. Checked FIRST among
--                                      the costly steps, so a caller RLS will refuse never
--                                      creates a form, takes a confirmation number, or sees an
--                                      error other than the RLS refusal. It is false with no
--                                      signed-in person, so the seed (postgres, no JWT),
--                                      service_role (the Stripe webhook, edge functions, the
--                                      seed's SET LOCAL ROLE service_role block, the waitlist
--                                      cron) and migrations never attach. Those writers shape
--                                      their rows on purpose: seed-demo.sql section 6b keeps its
--                                      fixtures formless ("the page shows both shapes side by
--                                      side"), card entries are the webhook's, and a seed that
--                                      gained forms would collide with section 6b's plain INSERT
--                                      of form ...070 and make seed_demo_assert_no_paid_strays
--                                      refuse every later reseed (its enrollment arm refuses any
--                                      paid form on the seed's shows but ...070).
--       a dog with an owner            no owner, no exhibitor to name: the entry stays formless,
--                                      as today.
--     Every writer of public.entries, and what this trigger does with it:
--       * the replication upload (submitOfflineLateEntry, a secretary's PostgREST INSERT):
--         attached. This is the path the issue is about.
--       * submit_show_entries: the app always passes the form it just found or created
--         (submitShowRegistration -> createShowRegistration -> dbRegistrationId; card checkout
--         never calls it, submitShowRegistration refuses credit_card). With p_registration_id
--         NULL only a direct RPC by a show official gets through (an exhibitor without a form
--         is refused 42501); those entries are desk entries (secretary_paid / group_payment /
--         waived / cash / check, never card), so they are attached like a desk entry and their
--         money is recorded by the AFTER trigger (submit_show_entries records none itself
--         without a form). With a form: untouched.
--       * create_online_paid_entry (service_role, card): untouched (no person, method 'online').
--       * stripe-webhook buildEntryInsert (service_role, card): untouched.
--       * promote_waitlist_entry_internal (manual offer by a secretary, and the cron):
--         untouched ('pending-payment').
--       * move_up_entry: untouched (moved_from_entry_id; it copies the root's form).
--       * seed_demo_restore_show_day_fixture (service_role only) and seed-demo.sql: untouched.
--     A new form starts 'waived' (method 'waived') for a waived or comped entry, 'refunded' for a
--     refunded one, else 'pending', with the entry's desk method (cash, check, waived,
--     secretary_paid, group_payment) as its payment_method. The row's updated_at is set to the
--     server's clock, so the device's next incremental pull (entry_results_changed_since reads
--     updated_at) brings the form id back even when the device stamped an older time offline.
--
--   trg_entries_settle_attached_form_money, AFTER INSERT on entries. For an entry the BEFORE
--   trigger just attached, money the desk already took at the entry goes ONTO THE FORM, counted
--   once. How it knows: the BEFORE trigger appends the row's id to the transaction-local
--   setting myk9.entry_form_attached, a comma-separated set of the entry ids this transaction
--   attached; the AFTER trigger acts only when its own id is an element of that set (split into
--   an array, compared element by element: no substring match). An entry that arrived with a
--   form is never in it. The set is left alone: an id is attached once (the entries primary
--   key), and the set ends with the transaction. So in a multi-row INSERT, where every BEFORE
--   row trigger runs before any AFTER row trigger, every attached row still settles its own
--   money. What this relies on: set_config(..., true) is SET LOCAL, which changes the setting
--   for the rest of the current transaction, so a value written in a BEFORE row trigger is
--   read by the AFTER row triggers of the same statement (they fire later in the same
--   transaction; private.entries_direct_write_gate / entries_apply_junior_fee rely on the same
--   reading). Setting changes are transactional: ROLLBACK TO SAVEPOINT (an exception block in
--   plpgsql, such as those in submit_show_entries) undoes a set_config made after the
--   savepoint together with the rows inserted after it, so the set never names a row that is
--   not there. The trigger function's own SET search_path clause restores only search_path on
--   exit, not this setting.
--     * paid by cash or check: private.record_enrollment_payment_core, the one place the form
--       money rules live. It writes ONE form-parented show_payments row, adds to paid_amount and
--       moves the status, keyed by client_payment_id = the entry's id, so a second call for the
--       same entry writes nothing. (A replication retry of the INSERT itself dies on the entries
--       primary key, 23505, and rolls back with everything this trigger did; mutation-execute.ts
--       treats it as success.) The received date is the entry's, else its submission day on the
--       show's calendar, never later than today there (the core refuses a future date, and a
--       refused sync would strand the entry).
--     * paid as secretary_paid or group_payment (exactly those two): paid_amount grows by the
--       fee and the form is 'paid' once covered, exactly what submit_show_entries does for those
--       methods. No ledger row: the cash box never held that money.
--     * paid with any other method, or none (entries.payment_method has no CHECK): nothing is
--       recorded. The form owes the fee, as in case (a), and the money is recorded on it with
--       Cash / Check like any owing form. Nothing is invented from a label.
--     Only for a caller who may record money on the show (private.can_record_show_payment: a
--     platform/site admin, or the show's office manager holding the secretary role; the
--     predicate the old desk ledger trigger used). A caller who may insert the entry but not
--     record money (a club admin without the secretary role, a trial_secretary) gets the entry
--     and its form and NO money: on Entry Management she sees the exhibitor's form with
--     "Payment due" for the fee (Show Desk and the Financial Report count it as owed) although
--     the entry was keyed as paid. It is resolved by someone who may record money choosing
--     Paid in Full: Cash / Check on that form, which writes the ledger row. Before this
--     migration the same caller got a formless 'paid' entry and no ledger row either, so the
--     close-out never counted that money; now it is visibly owed instead of silently missing.
--   The old entry-level ledger trigger (trg_entries_desk_payment_ledger) returns early once
--   registration_id is set, so an attached entry never also gets an entry-parented row.
--
-- FIRING ORDER on one INSERT (BEFORE in name order, then AFTER in name order):
--   BEFORE ... trg_entries_junior_fee ... trg_restrict_entry_refund_decision_columns_insert,
--          trg_zz_entries_attach_entry_form (form found or created; total derived as it stands)
--   AFTER  ... trg_entries_desk_payment_ledger (registration_id set: does nothing),
--          trg_entries_refresh_enrollment_total (private.refresh_enrollment_money: the new
--          total, and the derived status moves), trg_entries_settle_attached_form_money
--          (the money), trg_queue_entry_changed_email_insert.
-- So, for a $30 entry:
--   (a) unpaid pay-at-show, new form: form created 'pending' total 0; refresh: total $30,
--       received 0, stays 'pending'. Due $30: "Payment due", Show Desk and Outstanding count it,
--       and Paid in Full: Cash / Check are on its card.
--   (b) unpaid, joining a fully paid form ($50 paid_by_check, total $50): refresh: total $80,
--       received $50 < $80, settled form -> 'pending'. The form reopens to owing $30. Correct.
--   (c) desk-paid cash, new form: refresh: total $30, pending. Then the core records $30 cash
--       (one form-parented row keyed on the entry id), paid $30 >= $30 -> 'paid_by_cash'; the
--       cascade leaves the entry 'paid'. Close-out counts the row once.
--   (d) desk-paid cash, joining a form that owes $50 (pending entry A): refresh: total $80,
--       pending. Core: paid $30 < $80 -> 'pending', and its entries cascade turns every entry of
--       the form 'pending', the new one included (the form is the unit of payment, as when a
--       desk submission records money onto an owing form). Due $50. The $30 is in the ledger.
--   (e) waived (or comped): a new form starts 'waived' and owes 0 (a waived entry never counts,
--       MYK9-1634); joining a form changes nothing about it (refresh: total unchanged).
--   (f) refunded: a new form starts 'refunded' and owes 0 (MYK9-1961); joining a form changes
--       nothing. No money is written: what was handed back was handed back before this entry
--       reached the server.
--
-- BACKFILL (one-time, below). Applied-database facts read 2026-11-18 (read-only survey): live
-- entries with no form and no Stripe intent: 8 pending (1 with method check), 6 paid (1 check,
-- 5 with no method, 1 of them on a draft show), 2 refunded; about 29 soft-deleted; plus 5 live
-- card entries WITH an intent and no form, which are out of scope and left alone (the checkout
-- sync owns card forms).
--   Which entries: live (deleted_at NULL) on a live show (shows.deleted_at NULL; a draft show is
--   live), no form, no card marker (intent, method 'online' or 'credit_card', card_paid), not a
--   waitlist offer awaiting card payment ('pending-payment'), not a move-up
--   destination, a dog with an owner, and NOT the seed's own fixtures.
--   Left alone, and why:
--     * soft-deleted entries: they count nowhere (not in a form's total, not on any page), so a
--       form for them would only add an empty card; any desk money one holds stays where it is.
--     * entries on soft-deleted shows: the show is gone from every desk surface; nobody will
--       record money there.
--     * the seed's own fixtures: entries on the shows the reseed deletes (scope_shows of
--       seed_demo_assert_no_paid_strays: ...010/...011/...012 and the a1090000 load shows) and
--       the entry id spaces the reseed deletes before that guard (the hard-coded demo ids, the
--       myk9_109 range, the retired ...0014 fixture ids, the ...0731 show-day fixture range).
--       The next reseed recreates them formless by design (section 6b), and a paid form made for
--       one would make the guard's enrollment arm refuse every reseed after it. The seed cannot
--       clear forms before that guard either: seedDemoSelfCleaningRelationshipDeleteContract
--       pins every enrollments delete after it. Giving the fixtures forms is a change to the
--       seed, not to this migration.
--   What each entry's money does (no money appears or disappears):
--     * an entry-parented show_payments row of the entry is RE-PARENTED to the form (entry_id
--       NULL, enrollment_id the form), amount, method, day and kind unchanged. The ledger's row
--       count, its total, and its total per (show, day, method) are unchanged: checked below,
--       and the migration aborts otherwise. Close-out reads the ledger by show and day, so its
--       money received does not move.
--     * the form's paid_amount grows by that entry's ledger money; a PAID entry with no ledger
--       row (no method, secretary_paid, or cash/check written by someone who could not record
--       money) adds its fee to paid_amount with no ledger row, as submit_show_entries does for
--       secretary_paid. So no form comes out owing money its entries say was paid.
--     * a REFUNDED entry: its fee is not owed (MYK9-1961). Its ledger money is added to
--       paid_amount, and what was actually handed back to refund_amount, from the record that
--       holds it: the entry's own ledger refund rows, else entries.refund_amount (the refund
--       stamp; never above the money in). $30 in and $10 back leaves $20 held on the form. A
--       refunded entry with no ledger row and no recorded partial amount adds nothing (nothing
--       recorded in, a full refund or none recorded out). A refunded entry whose refunded
--       amount the data does not establish is NOT attached: it stays formless, the backfill's
--       notice counts it, and the pre-run query below lists it (left_formless_refund_unknown)
--       (private.entry_form_backfill_refund_unknown says which shapes and why). So no form
--       shows refunded money as paid, or hides money still held.
--     * a new form's status is decided once, at its INSERT, from its entries: 'paid' when its
--       money covers what it owes, 'pending' when it owes more; owing nothing: 'partial_refund'
--       if it holds money and a refunded entry is on it, 'paid' if it holds money, else
--       'refunded' (a refunded entry), 'waived' (a Free one) or 'pending'. An existing form
--       keeps its status and takes refresh_enrollment_money's derived moves as the entries
--       attach (it reopens when it now owes more).
--
--   PRE-RUN (read-only; run before db push to see exactly what this will change; the WHERE is
--   private.entry_form_backfill_candidate's, inlined because the function does not exist yet):
--     SELECT e.id AS entry_id, e.show_id, s.name AS show_name, d.owner_id AS exhibitor_id,
--            e.payment_status, e.payment_method, e.entry_fee,
--            (SELECT en.id || ' ' || en.payment_status FROM public.enrollments en
--              WHERE en.show_id = e.show_id AND en.handler_id = d.owner_id) AS joins_form,
--            (SELECT string_agg(sp.kind || ' ' || sp.amount || ' ' || sp.method, ', ')
--               FROM public.show_payments sp WHERE sp.entry_id = e.id) AS ledger_rows_moved,
--            e.refund_amount,
--            -- private.entry_form_backfill_refund_unknown, inlined: true = left formless.
--            CASE
--              WHEN e.payment_status IS DISTINCT FROM 'refunded' THEN false
--              WHEN l.refund_rows > 0 THEN false
--              WHEN l.money_in > 0 THEN e.refund_amount IS NULL OR e.refund_amount > l.money_in
--                                       OR e.refund_amount <= 0
--              ELSE e.refund_amount IS NOT NULL AND e.refund_amount <> COALESCE(e.entry_fee, 0)
--            END AS left_formless_refund_unknown
--       FROM public.entries e
--       CROSS JOIN LATERAL (
--         SELECT COALESCE(sum(sp.amount) FILTER (WHERE sp.kind <> 'refund'), 0) AS money_in,
--                count(*) FILTER (WHERE sp.kind = 'refund') AS refund_rows
--           FROM public.show_payments sp WHERE sp.entry_id = e.id) l
--       JOIN public.shows s ON s.id = e.show_id
--       JOIN public.dogs d ON d.id = e.dog_id
--      WHERE e.registration_id IS NULL AND e.deleted_at IS NULL AND s.deleted_at IS NULL
--        AND e.stripe_payment_intent_id IS NULL
--        AND e.payment_method IS DISTINCT FROM 'online' AND e.payment_method IS DISTINCT FROM 'credit_card'
--        AND e.entry_status IS DISTINCT FROM 'pending-payment'
--        AND e.card_paid IS NOT TRUE AND e.moved_from_entry_id IS NULL AND d.owner_id IS NOT NULL
--        AND e.show_id NOT IN ('dededede-0000-0000-0000-000000000010',
--                              'dededede-0000-0000-0000-000000000011',
--                              'dededede-0000-0000-0000-000000000012')
--        AND NOT (e.show_id >= 'a1090000-0000-0000-0010-000000000000'
--                 AND e.show_id < 'a1090000-0000-0000-0011-000000000000')
--        AND NOT (e.id >= 'a1090000-0000-0000-0002-000000000000'
--                 AND e.id < 'a1090000-0000-0000-0003-000000000000')
--        AND NOT (e.id >= 'dededede-0000-0000-0731-000000000000'
--                 AND e.id < 'dededede-0000-0000-0732-000000000000')
--        AND NOT (e.id >= 'dededede-0000-0000-0014-000000000000'
--                 AND e.id < 'dededede-0000-0000-0015-000000000000')
--        AND e.id::text NOT LIKE 'dededede-0000-0000-0000-0000000000%'
--      ORDER BY e.show_id, d.owner_id, e.id;
--     -- (the last line is broader than the function's 13 hard-coded ids; it only hides rows
--     -- from this preview, never from the backfill)
--     -- and the ledger totals the migration holds equal:
--     SELECT count(*), sum(amount) FROM public.show_payments;
--     SELECT show_id, received_on, method, sum(amount) FROM public.show_payments
--      GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
--   POST-RUN (the same two ledger queries must answer exactly as before), plus the forms the
--   backfill touched (their entries' updated_at moved when they were attached):
--     SELECT en.id, en.show_id, en.handler_id, en.payment_status, en.total_amount,
--            en.paid_amount, en.refund_amount, en.confirmation_number
--       FROM public.enrollments en
--      WHERE EXISTS (SELECT 1 FROM public.entries e
--                     WHERE e.registration_id = en.id AND e.updated_at > now() - interval '1 hour')
--      ORDER BY en.show_id;
--     SELECT count(*) FROM public.entries e
--      WHERE e.registration_id IS NULL AND private.entry_form_backfill_candidate(e.id);  -- 0
--     -- the refunded entries left formless because their refunded amount is not recorded:
--     SELECT e.id, e.show_id, e.entry_fee, e.refund_amount FROM public.entries e
--      WHERE e.registration_id IS NULL AND private.entry_form_backfill_eligible(e.id)
--        AND private.entry_form_backfill_refund_unknown(e.id);
--   The migration itself refuses to commit if the ledger's rows, total, or total per (show,
--   day, method) change, if an attached entry keeps an entry-parented row, or if any form's
--   money held or total owed moves by anything but what a snapshot taken before anything moves
--   says its new entries hold and owe (the signed sum of their ledger rows less a refund only
--   entries.refund_amount records, or a paid entry's fee; the fees enrollment_owed_cents
--   counts), computed separately from the expressions that write the form.
--
-- A FORM, ONCE GIVEN, IS KEPT. trg_zz_entries_keep_entry_form, BEFORE UPDATE on entries with
-- no column list (so no UPDATE OF list can skip it), WHEN the row had a form and the update
-- would leave it with none: for the API roles (current_user anon / authenticated) the old
-- registration_id is kept, silently. A device that never pulled the form the server gave its
-- entry still holds registration_id NULL, and a full-row upload (entryToSupabaseRow writes
-- registration_id on every row; the conflict "keep mine" and rebuildUpdatePayload paths send
-- the whole row) would detach the entry and leave its money on a form with no entry. Raising
-- would wedge that device's upload queue, so the trigger keeps the value instead. Nothing in
-- the migrations sets registration_id to NULL; owner-run code (SECURITY DEFINER functions run
-- as postgres, migrations) and service_role still can. A move from one form to another (the
-- checkout sync, sync_enrollment_on_payment_success, a SECURITY DEFINER function) never meets
-- the WHEN clause. Named trg_zz_ so it runs after every other BEFORE UPDATE trigger and sees
-- the row as they leave it.
--   Why only registration_id needs this: an entries UPDATE uploads only the columns it changed
--   plus id and updated_at (ReplicatedEntriesTable.changedColumns.ts), and a rebuilt full row
--   is narrowed to the mutation's queued keys (packages/replication/src/mutation-queue-rewrite.ts),
--   so a device does not write a stale payment_status back over the server's; only a legacy
--   full-row queued mutation could.
--
-- PUSH RISK (unproven, fails safe). The backfill writes enrollments.paid_amount /
-- refund_amount / refunded_at, which trg_restrict_enrollment_money_columns(_insert)
-- (20260717120000) admits only when session_user = 'postgres', the role is service_role, the
-- caller is a platform admin or holds the secretary role. `supabase db push` connects through
-- the pooler as postgres.<project-ref> (the db-push skill), which should make session_user
-- 'postgres', but no earlier migration proves it: none UPDATEs those columns on existing rows
-- outside a function. If the guard refuses, it raises 42501 and the whole migration rolls back
-- (BEGIN ... COMMIT below); nothing half-applies. Pre-check, on the connection used to push:
--     SELECT session_user = 'postgres' OR current_setting('role', true) = 'service_role'
--            AS money_guard_passes;
--
-- MONEY. Nothing here creates or queues a refund, calls Stripe, or writes refund_requests or a
-- payout. The only ledger write is the core's payment row for a desk-paid entry at sync, and the
-- backfill's re-parenting, which keeps every total.

BEGIN;

-- ---------------------------------------------------------------------------
-- The exhibitor's form for a show: found, or created. One place, for the trigger and the
-- backfill. SECURITY INVOKER: both callers already run as the function owner (the trigger is
-- SECURITY DEFINER, the backfill is the migration), which is what lets the INSERT pass
-- enrollments' forced RLS and reach registration_confirmation_seq through
-- set_confirmation_number. No client can call it (private schema, no grant).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.entry_form_for(
  p_show_id uuid,
  p_handler_id uuid,
  p_status text,
  p_method text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_form uuid;
BEGIN
  -- Look first: set_confirmation_number (BEFORE INSERT on enrollments) takes a value from
  -- registration_confirmation_seq before ON CONFLICT is checked, so inserting to join an
  -- existing form would burn a confirmation number every time.
  SELECT en.id INTO v_form
    FROM public.enrollments en
   WHERE en.show_id = p_show_id AND en.handler_id = p_handler_id;
  IF v_form IS NOT NULL THEN
    RETURN v_form;
  END IF;

  INSERT INTO public.enrollments (show_id, handler_id, payment_status, payment_method)
  VALUES (p_show_id, p_handler_id, p_status, p_method)
  ON CONFLICT (show_id, handler_id) DO NOTHING
  RETURNING id INTO v_form;

  -- One a concurrent insert just committed: join it. READ COMMITTED gives this statement a
  -- fresh snapshot, so the committed row is visible.
  IF v_form IS NULL THEN
    SELECT en.id INTO v_form
      FROM public.enrollments en
     WHERE en.show_id = p_show_id AND en.handler_id = p_handler_id;
  END IF;

  RETURN v_form;
END;
$$;

COMMENT ON FUNCTION private.entry_form_for(uuid, uuid, text, text) IS
  'MYK9-1930: the exhibitor''s entry form for a show (one per show and handler): the existing one, else a new one with the given starting status and method.';

REVOKE ALL ON FUNCTION private.entry_form_for(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- The starting status and method of a form created for one entry.
CREATE OR REPLACE FUNCTION private.entry_form_start(
  p_payment_status text,
  p_payment_method text,
  p_comped boolean,
  OUT status text,
  OUT method text
)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
           WHEN p_comped IS TRUE OR p_payment_status = 'waived' THEN 'waived'
           WHEN p_payment_status IN ('refunded', 'partial_refund') THEN 'refunded'
           ELSE 'pending'
         END,
         CASE
           WHEN p_comped IS TRUE OR p_payment_status = 'waived' THEN 'waived'
           WHEN p_payment_method IN ('cash', 'check', 'waived', 'secretary_paid', 'group_payment')
             THEN p_payment_method
         END;
$$;

REVOKE ALL ON FUNCTION private.entry_form_start(text, text, boolean) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- BEFORE INSERT on entries: attach the form (header: which rows, which callers).
-- SECURITY DEFINER because the caller (an authenticated secretary) may not insert another
-- person's enrollment under RLS, nor use registration_confirmation_seq; it writes only the form
-- of the entry's own dog owner on the entry's own show, and only for an entry the caller is
-- inserting (RLS WITH CHECK on entries runs after BEFORE triggers: a refused entry rolls the
-- form back with it).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.entries_attach_entry_form()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_start record;
BEGIN
  IF NEW.registration_id IS NOT NULL
     OR NEW.deleted_at IS NOT NULL
     OR NEW.show_id IS NULL
     OR NEW.dog_id IS NULL
     OR NEW.moved_from_entry_id IS NOT NULL
     OR NEW.stripe_payment_intent_id IS NOT NULL
     OR NEW.payment_method IN ('online', 'credit_card')
     OR NEW.card_paid IS TRUE
     OR NEW.entry_status IS NOT DISTINCT FROM 'pending-payment'
     -- The entries_insert RLS predicate (20260915194500), before anything is written: a
     -- caller RLS will refuse gets that refusal and nothing else. False with no person.
     OR NOT public.can_manage_show(NEW.show_id) THEN
    RETURN NEW;
  END IF;

  SELECT d.owner_id INTO v_owner FROM public.dogs d WHERE d.id = NEW.dog_id;
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_start
    FROM private.entry_form_start(NEW.payment_status, NEW.payment_method, NEW.comped);
  NEW.registration_id := private.entry_form_for(NEW.show_id, v_owner, v_start.status, v_start.method);
  -- The server changed the row: its own clock, so the device's next pull brings it back.
  NEW.updated_at := now();
  -- Tell the AFTER trigger this row's form is the server's doing: add the id to the
  -- transaction's set (header).
  PERFORM pg_catalog.set_config(
    'myk9.entry_form_attached',
    concat_ws(',', NULLIF(current_setting('myk9.entry_form_attached', true), ''), NEW.id::text),
    true
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.entries_attach_entry_form() IS
  'MYK9-1930: BEFORE INSERT on entries. A non-card entry with no entry form, inserted by someone who manages the show (can_manage_show, the entries_insert RLS predicate), joins (or creates) the dog owner''s form for the show. Not waitlist offers awaiting card payment (pending-payment), move-up destinations, dogs with no owner, the seed, service_role or migrations.';

REVOKE ALL ON FUNCTION private.entries_attach_entry_form() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_zz_entries_attach_entry_form ON public.entries;
CREATE TRIGGER trg_zz_entries_attach_entry_form
  BEFORE INSERT ON public.entries
  FOR EACH ROW
  WHEN (NEW.registration_id IS NULL)
  EXECUTE FUNCTION private.entries_attach_entry_form();

-- ---------------------------------------------------------------------------
-- AFTER INSERT on entries: the desk's money for an attached entry goes onto its form, once.
-- SECURITY DEFINER because the ledger and the form's money columns are not the caller's to
-- write; the record predicate (private.can_record_show_payment) is restated here.
-- Named to sort after trg_entries_refresh_enrollment_total, so the core reads the form's total
-- with this entry in it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.entries_settle_attached_form_money()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fee numeric;
  v_tz text;
  v_today date;
  v_received date;
BEGIN
  IF NEW.registration_id IS NULL
     OR NOT (NEW.id::text = ANY (string_to_array(
               COALESCE(current_setting('myk9.entry_form_attached', true), ''), ','))) THEN
    RETURN NULL;
  END IF;

  v_fee := round(COALESCE(NEW.entry_fee, 0), 2);
  IF NEW.payment_status IS DISTINCT FROM 'paid'
     OR v_fee <= 0
     OR NEW.card_paid IS TRUE
     OR NEW.comped IS TRUE
     OR NOT private.can_record_show_payment(NEW.show_id) THEN
    RETURN NULL;
  END IF;

  IF NEW.payment_method IN ('cash', 'check') THEN
    v_tz := private.show_time_zone(NEW.show_id);
    v_today := (now() AT TIME ZONE v_tz)::date;
    v_received := LEAST(
      COALESCE(NEW.payment_received_on,
               (COALESCE(NEW.submitted_at, NEW.created_at, now()) AT TIME ZONE v_tz)::date),
      v_today
    );
    PERFORM private.record_enrollment_payment_core(
      NEW.registration_id, 'payment', v_fee, NEW.payment_method, v_received,
      NEW.payment_reference, NEW.payment_notes, NEW.id
    );
  ELSIF NEW.payment_method IN ('secretary_paid', 'group_payment') THEN
    -- Recorded on the form, as submit_show_entries records those two methods. Not box money,
    -- so no ledger row. Any other or no method records nothing: the form owes the fee.
    UPDATE public.enrollments en
       SET paid_amount = COALESCE(en.paid_amount, 0) + v_fee,
           payment_status = CASE
             WHEN (COALESCE(en.paid_amount, 0) + v_fee - COALESCE(en.refund_amount, 0)) * 100
                  + en.card_covered_cents >= COALESCE(en.total_amount, 0)
             THEN 'paid'
             ELSE 'pending'
           END,
           updated_at = now()
     WHERE en.id = NEW.registration_id;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.entries_settle_attached_form_money() IS
  'MYK9-1930: AFTER INSERT on entries. Money the desk took for an entry the server just put on a form is recorded on that form once: cash/check through record_enrollment_payment_core (one form-parented ledger row keyed on the entry id), secretary_paid / group_payment on paid_amount, any other method nothing (the form owes). Only for a caller who may record money on the show.';

REVOKE ALL ON FUNCTION private.entries_settle_attached_form_money() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_entries_settle_attached_form_money ON public.entries;
CREATE TRIGGER trg_entries_settle_attached_form_money
  AFTER INSERT ON public.entries
  FOR EACH ROW
  WHEN (NEW.registration_id IS NOT NULL)
  EXECUTE FUNCTION private.entries_settle_attached_form_money();

-- ---------------------------------------------------------------------------
-- BEFORE UPDATE on entries: a form, once given, is kept against an API role's NULL (header).
-- SECURITY INVOKER on purpose: current_user is then the caller's role (authenticated / anon
-- through PostgREST, postgres inside a SECURITY DEFINER function or a migration,
-- service_role), the same reading private.entries_confirmation_claim_guard uses.
-- No column list: an UPDATE OF list matches only the columns a statement names, and a full-row
-- upload is exactly the statement this must catch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.entries_keep_entry_form()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.registration_id := OLD.registration_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.entries_keep_entry_form() IS
  'MYK9-1930: BEFORE UPDATE on entries. A client (anon/authenticated) update that would clear a non-null registration_id keeps it: a device that never pulled the form the server gave its entry must not detach it with a full-row upload. Owner-run code and service_role may still change it.';

REVOKE ALL ON FUNCTION private.entries_keep_entry_form() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_zz_entries_keep_entry_form ON public.entries;
CREATE TRIGGER trg_zz_entries_keep_entry_form
  BEFORE UPDATE ON public.entries
  FOR EACH ROW
  WHEN (OLD.registration_id IS NOT NULL AND NEW.registration_id IS NULL)
  EXECUTE FUNCTION private.entries_keep_entry_form();

-- ---------------------------------------------------------------------------
-- The backfill's row rules, kept as functions so the owner's pre/post queries in the header
-- read the very predicates the backfill used. Read-only. Not callable by clients.
--   entry_form_backfill_eligible: which entries the backfill is about (header).
--   entry_form_backfill_refund_unknown: a refunded entry whose refunded amount the data does
--     not establish (header, "refunded entries"). Left formless, counted and listed.
--   entry_form_backfill_candidate: eligible and not refund-unknown. These are attached.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.entry_form_backfill_eligible(p_entry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.entries e
      JOIN public.shows s ON s.id = e.show_id
      JOIN public.dogs d ON d.id = e.dog_id
     WHERE e.id = p_entry_id
       AND e.registration_id IS NULL
       AND e.deleted_at IS NULL
       AND s.deleted_at IS NULL
       AND e.stripe_payment_intent_id IS NULL
       AND e.payment_method IS DISTINCT FROM 'online'
       AND e.payment_method IS DISTINCT FROM 'credit_card'
       -- A waitlist offer awaiting card payment gets its form from the checkout sync.
       AND e.entry_status IS DISTINCT FROM 'pending-payment'
       AND e.card_paid IS NOT TRUE
       AND e.moved_from_entry_id IS NULL
       AND d.owner_id IS NOT NULL
       -- The seed's own fixtures (header): the shows the reseed deletes ...
       AND e.show_id NOT IN ('dededede-0000-0000-0000-000000000010',
                             'dededede-0000-0000-0000-000000000011',
                             'dededede-0000-0000-0000-000000000012')
       AND NOT (e.show_id >= 'a1090000-0000-0000-0010-000000000000'::uuid
                AND e.show_id < 'a1090000-0000-0000-0011-000000000000'::uuid)
       -- ... and the entry ids it deletes before seed_demo_assert_no_paid_strays.
       AND NOT (e.id >= 'a1090000-0000-0000-0002-000000000000'::uuid
                AND e.id < 'a1090000-0000-0000-0003-000000000000'::uuid)
       AND NOT (e.id >= 'dededede-0000-0000-0731-000000000000'::uuid
                AND e.id < 'dededede-0000-0000-0732-000000000000'::uuid)
       AND NOT (e.id >= 'dededede-0000-0000-0014-000000000000'::uuid
                AND e.id < 'dededede-0000-0000-0015-000000000000'::uuid)
       AND e.id NOT IN ('dededede-0000-0000-0000-000000000051', 'dededede-0000-0000-0000-000000000052',
                        'dededede-0000-0000-0000-000000000053', 'dededede-0000-0000-0000-000000000054',
                        'dededede-0000-0000-0000-000000000055', 'dededede-0000-0000-0000-000000000056',
                        'dededede-0000-0000-0000-000000000057', 'dededede-0000-0000-0000-000000000058',
                        'dededede-0000-0000-0000-000000000059', 'dededede-0000-0000-0000-000000000060',
                        'dededede-0000-0000-0000-000000000067', 'dededede-0000-0000-0000-000000000068',
                        'dededede-0000-0000-0000-000000000069')
  );
$$;

COMMENT ON FUNCTION private.entry_form_backfill_eligible(uuid) IS
  'MYK9-1930: the one-time backfill''s scope. A live, non-card entry with no form, on a live show, whose dog has an owner, that is not one of the seed''s own fixtures.';

REVOKE ALL ON FUNCTION private.entry_form_backfill_eligible(uuid) FROM PUBLIC, anon, authenticated;

-- A refunded entry (entries.payment_status has no 'partial_refund': 003's CHECK is pending /
-- paid / refunded / waived, never widened; the predicate names it anyway, as 1961 does) whose
-- refunded amount the data does not establish. What records a formless entry's refund amount:
--   * show_payments rows of kind 'refund' parented by the entry: the desk ledger, the box's own
--     record. Truthful whenever present (no writer creates them today: only
--     record_enrollment_payment_core writes refunds, always on a form; the shape is honoured
--     if one exists).
--   * entries.refund_amount: the refund stamp only the payment service may write
--     (trg_restrict_entry_refund_columns); the amount handed back for that entry.
--   Not sources: refund_requests (card checkouts and payment links only, keyed on a Stripe
--   intent: card entries are out of the backfill), refund_decision / refund_decided_at (a
--   pull's yes/no, no amount), refund_notes (free text).
-- Unknown, so left out:
--   * desk money came in (ledger rows net positive) and no ledger refund row and no
--     refund_amount, or a refund_amount above the money in: how much went back is not
--     recorded;
--   * no desk money came in (no ledger, or ledger rows netting to zero or less) but a
--     refund_amount other than the fee is recorded: a partial refund of money the ledger never
--     saw, so what is still held is not recorded either.
-- Known: a ledger refund row (refunded = those rows); 0 < refund_amount <= money in
-- (refunded = refund_amount); nothing in and nothing out recorded, or refund_amount equal to
-- the fee with no desk money (a full refund: nothing held, nothing to put on the form).
CREATE OR REPLACE FUNCTION private.entry_form_backfill_refund_unknown(p_entry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $
  SELECT COALESCE((
    SELECT CASE
             WHEN e.payment_status IS DISTINCT FROM 'refunded'
              AND e.payment_status IS DISTINCT FROM 'partial_refund' THEN false
             WHEN l.refund_rows > 0 THEN false
             WHEN l.money_in > 0 THEN e.refund_amount IS NULL OR e.refund_amount > l.money_in
                                      OR e.refund_amount <= 0
             ELSE e.refund_amount IS NOT NULL AND e.refund_amount <> COALESCE(e.entry_fee, 0)
           END
      FROM public.entries e
      CROSS JOIN LATERAL (
        SELECT COALESCE(sum(sp.amount) FILTER (WHERE sp.kind <> 'refund'), 0) AS money_in,
               count(*) FILTER (WHERE sp.kind = 'refund') AS refund_rows
          FROM public.show_payments sp
         WHERE sp.entry_id = e.id
      ) l
     WHERE e.id = p_entry_id), false);
$;

COMMENT ON FUNCTION private.entry_form_backfill_refund_unknown(uuid) IS
  'MYK9-1930: a refunded entry whose refunded amount neither the desk ledger nor entries.refund_amount establishes; the backfill leaves it formless rather than invent a figure.';

REVOKE ALL ON FUNCTION private.entry_form_backfill_refund_unknown(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.entry_form_backfill_candidate(p_entry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $
  SELECT private.entry_form_backfill_eligible(p_entry_id)
         AND NOT private.entry_form_backfill_refund_unknown(p_entry_id);
$;

COMMENT ON FUNCTION private.entry_form_backfill_candidate(uuid) IS
  'MYK9-1930: the one-time backfill''s rule: entry_form_backfill_eligible and not entry_form_backfill_refund_unknown.';

REVOKE ALL ON FUNCTION private.entry_form_backfill_candidate(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The one-time backfill (header: which entries, what their money does). A function, run once
-- below, so supabase/tests/myk9_1930_late_entry_gets_form_test.sql can replay it on fixtures.
-- It only ever touches entries that still have no form, so a second run finds nothing.
-- Runs as the migration (postgres, no JWT): the money-column guard lets the form writes
-- through when session_user is postgres (header: PUSH RISK; if not, it raises and the whole migration rolls back), and every derived status move refresh_enrollment_money
-- makes is one the payment-status guard accepts from anyone. Not callable by clients.
-- Returns how many entries it attached.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.backfill_entry_forms()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $backfill$
DECLARE
  v_rows_before bigint;
  v_sum_before numeric;
  v_groups_before text;
  v_rows_after bigint;
  v_sum_after numeric;
  v_groups_after text;
  v_group record;
  v_form uuid;
  v_attached uuid[] := '{}';
  v_status text;
  v_expect jsonb;
  v_key text;
  v_net_before integer;
  v_total_before integer;
  v_net_after integer;
  v_total_after integer;
  v_excluded integer;
BEGIN
  SELECT count(*), COALESCE(sum(sp.amount), 0) INTO v_rows_before, v_sum_before
    FROM public.show_payments sp;
  SELECT string_agg(g.k, '|' ORDER BY g.k) INTO v_groups_before
    FROM (SELECT sp.show_id::text || ':' || sp.received_on || ':' || sp.method || ':' || sum(sp.amount) AS k
            FROM public.show_payments sp GROUP BY sp.show_id, sp.received_on, sp.method) g;

  -- What each exhibitor's form must gain, read from the data as it stands BEFORE anything
  -- moves, in its own terms (not the money expressions the loop applies): money held = the
  -- signed sum of the entry's own ledger rows (payments in, refunds and reversals out), less a
  -- refund the ledger does not carry but entries.refund_amount records; with no ledger rows,
  -- a paid entry's fee (recorded paid, outside the ledger) and nothing otherwise. What is owed =
  -- the fees enrollment_owed_cents counts. Cents, keyed show|exhibitor.
  SELECT jsonb_object_agg(x.k, jsonb_build_array(x.held, x.owed)) INTO v_expect
    FROM (
      SELECT e.show_id::text || '|' || d.owner_id::text AS k,
             round(sum(CASE
               WHEN l.n > 0 THEN l.net
                 - CASE WHEN e.payment_status IN ('refunded', 'partial_refund') AND l.refunds = 0
                        THEN COALESCE(e.refund_amount, 0) ELSE 0 END
               WHEN e.payment_status = 'paid' THEN COALESCE(e.entry_fee, 0)
               ELSE 0 END) * 100)::integer AS held,
             round(sum(CASE
               WHEN e.payment_status IN ('waived', 'refunded', 'partial_refund')
                 OR e.comped IS TRUE OR e.refund_amount IS NOT NULL THEN 0
               ELSE COALESCE(e.entry_fee, 0) END) * 100)::integer AS owed
        FROM public.entries e
        JOIN public.dogs d ON d.id = e.dog_id
        CROSS JOIN LATERAL (
          SELECT count(*) AS n, COALESCE(sum(sp.amount), 0) AS net,
                 count(*) FILTER (WHERE sp.kind = 'refund') AS refunds
            FROM public.show_payments sp WHERE sp.entry_id = e.id
        ) l
       WHERE e.registration_id IS NULL
         AND private.entry_form_backfill_candidate(e.id)
       GROUP BY 1
    ) x;

  SELECT count(*) INTO v_excluded
    FROM public.entries e
   WHERE e.registration_id IS NULL
     AND private.entry_form_backfill_eligible(e.id)
     AND private.entry_form_backfill_refund_unknown(e.id);

  FOR v_group IN
    WITH cand AS (
      SELECT e.id, e.show_id, d.owner_id, e.payment_status, e.payment_method,
             COALESCE(e.entry_fee, 0) AS fee, e.comped, e.refund_amount, e.refunded_at,
             EXISTS (SELECT 1 FROM public.show_payments sp WHERE sp.entry_id = e.id) AS has_ledger,
             COALESCE((SELECT sum(sp.amount) FROM public.show_payments sp
                        WHERE sp.entry_id = e.id AND sp.kind <> 'refund'), 0) AS ledger_in,
             COALESCE((SELECT -sum(sp.amount) FROM public.show_payments sp
                        WHERE sp.entry_id = e.id AND sp.kind = 'refund'), 0) AS ledger_out
        FROM public.entries e
        JOIN public.dogs d ON d.id = e.dog_id
       WHERE e.registration_id IS NULL
         AND private.entry_form_backfill_candidate(e.id)
    ),
    money AS (
      SELECT c.*,
             CASE WHEN c.has_ledger THEN c.ledger_in
                  WHEN c.payment_status = 'paid' THEN c.fee
                  ELSE 0 END AS paid_add,
             -- What went back: the ledger's own refund rows; failing those, for a refunded
             -- entry whose desk money came in, the recorded entries.refund_amount (never above
             -- the money in: entry_form_backfill_refund_unknown leaves out every other shape).
             CASE WHEN c.has_ledger
                  THEN c.ledger_out
                       + CASE WHEN c.payment_status IN ('refunded', 'partial_refund')
                               AND c.ledger_out = 0 AND c.ledger_in > 0
                              THEN COALESCE(c.refund_amount, 0) ELSE 0 END
                  ELSE 0 END AS refund_add,
             -- What the entry adds to its form's total (private.enrollment_owed_cents).
             CASE WHEN c.payment_status IS DISTINCT FROM 'waived'
                   AND c.payment_status IS DISTINCT FROM 'refunded'
                   AND c.payment_status IS DISTINCT FROM 'partial_refund'
                   AND c.comped IS NOT TRUE
                   AND c.refund_amount IS NULL
                  THEN c.fee ELSE 0 END AS owed
        FROM cand c
    )
    SELECT m.show_id, m.owner_id,
           array_agg(m.id ORDER BY m.id) AS entry_ids,
           sum(m.paid_add) AS paid_add,
           sum(m.refund_add) AS refund_add,
           sum(m.owed) AS owed,
           max(m.refunded_at) AS refunded_at,
           bool_or(m.payment_status IN ('refunded', 'partial_refund')) AS any_refunded,
           bool_or(m.payment_status = 'waived' OR m.comped IS TRUE) AS any_free,
           CASE WHEN count(DISTINCT m.payment_method) = 1
                 AND min(m.payment_method) IN ('cash', 'check', 'waived', 'secretary_paid', 'group_payment')
                THEN min(m.payment_method) END AS method
      FROM money m
     GROUP BY m.show_id, m.owner_id
     ORDER BY m.show_id, m.owner_id
  LOOP
    SELECT en.id INTO v_form
      FROM public.enrollments en
     WHERE en.show_id = v_group.show_id AND en.handler_id = v_group.owner_id
       FOR UPDATE;

    IF FOUND THEN
      -- An existing form: bring its derived figures up to date first, so the due check below
      -- measures only this group. Then add the money and keep its status;
      -- refresh_enrollment_money makes the derived moves as the entries attach below.
      PERFORM private.refresh_enrollment_money(v_form);
      SELECT round((COALESCE(en.paid_amount, 0) - COALESCE(en.refund_amount, 0)) * 100)::integer,
             COALESCE(en.total_amount, 0)
        INTO v_net_before, v_total_before
        FROM public.enrollments en WHERE en.id = v_form;
      IF v_group.paid_add <> 0 OR v_group.refund_add <> 0 THEN
        UPDATE public.enrollments en
           SET paid_amount = COALESCE(en.paid_amount, 0) + v_group.paid_add,
               refund_amount = CASE WHEN v_group.refund_add > 0
                                    THEN COALESCE(en.refund_amount, 0) + v_group.refund_add
                                    ELSE en.refund_amount END,
               refunded_at = CASE WHEN v_group.refund_add > 0
                                  THEN COALESCE(en.refunded_at, v_group.refunded_at, now())
                                  ELSE en.refunded_at END,
               updated_at = now()
         WHERE en.id = v_form;
      END IF;
    ELSE
      v_net_before := 0;
      v_total_before := 0;
      v_status := CASE
        WHEN v_group.owed > 0 AND v_group.paid_add - v_group.refund_add >= v_group.owed THEN 'paid'
        WHEN v_group.owed > 0 THEN 'pending'
        -- Owes nothing and still holds money a refund did not hand back.
        WHEN v_group.paid_add - v_group.refund_add > 0 AND v_group.any_refunded
          THEN 'partial_refund'
        WHEN v_group.paid_add - v_group.refund_add > 0 THEN 'paid'
        WHEN v_group.any_refunded THEN 'refunded'
        WHEN v_group.any_free THEN 'waived'
        ELSE 'pending'
      END;
      INSERT INTO public.enrollments
        (show_id, handler_id, payment_status, payment_method, paid_amount, refund_amount, refunded_at)
      VALUES
        (v_group.show_id, v_group.owner_id, v_status, v_group.method, v_group.paid_add,
         NULLIF(v_group.refund_add, 0),
         CASE WHEN v_group.refund_add > 0 THEN COALESCE(v_group.refunded_at, now()) END)
      RETURNING id INTO v_form;
    END IF;

    -- The entries' desk money moves onto the form: same rows, new parent.
    UPDATE public.show_payments sp
       SET enrollment_id = v_form,
           entry_id = NULL
     WHERE sp.entry_id = ANY (v_group.entry_ids);

    -- Attach. Fires refresh_enrollment_money (total, derived status) and bumps updated_at
    -- (update_entries_updated_at), so devices pull the form id. Settled entries first (paid,
    -- refunded, Free), then the ones that still owe: refresh_enrollment_money settles a pending
    -- desk entry when the form's money covers its total, so an owing entry attached while only
    -- part of the form's entries are on it would be marked paid with a sibling's money.
    UPDATE public.entries e
       SET registration_id = v_form
     WHERE e.id = ANY (v_group.entry_ids)
       AND e.registration_id IS NULL
       AND (e.payment_status IN ('paid', 'refunded', 'partial_refund', 'waived')
            OR e.comped IS TRUE);
    UPDATE public.entries e
       SET registration_id = v_form
     WHERE e.id = ANY (v_group.entry_ids)
       AND e.registration_id IS NULL;

    -- The form gained exactly what the pre-backfill snapshot says these entries hold and owe
    -- (v_expect, computed before the loop from the ledger rows and entry columns, not from the
    -- expressions above).
    v_key := v_group.show_id::text || '|' || v_group.owner_id::text;
    SELECT round((COALESCE(en.paid_amount, 0) - COALESCE(en.refund_amount, 0)) * 100)::integer,
           COALESCE(en.total_amount, 0)
      INTO v_net_after, v_total_after
      FROM public.enrollments en WHERE en.id = v_form;
    IF v_net_after - v_net_before IS DISTINCT FROM (v_expect -> v_key ->> 0)::integer
       OR v_total_after - v_total_before IS DISTINCT FROM (v_expect -> v_key ->> 1)::integer THEN
      RAISE EXCEPTION 'MYK9-1930 backfill: form % held % -> % and owed % -> % cents; the data recorded % held and % owed',
        v_form, v_net_before, v_net_after, v_total_before, v_total_after,
        v_expect -> v_key ->> 0, v_expect -> v_key ->> 1;
    END IF;

    v_attached := v_attached || v_group.entry_ids;
  END LOOP;

  -- The ledger is unchanged: same rows, same total, same total per show, day and method.
  SELECT count(*), COALESCE(sum(sp.amount), 0) INTO v_rows_after, v_sum_after
    FROM public.show_payments sp;
  SELECT string_agg(g.k, '|' ORDER BY g.k) INTO v_groups_after
    FROM (SELECT sp.show_id::text || ':' || sp.received_on || ':' || sp.method || ':' || sum(sp.amount) AS k
            FROM public.show_payments sp GROUP BY sp.show_id, sp.received_on, sp.method) g;
  IF v_rows_after <> v_rows_before OR v_sum_after <> v_sum_before
     OR v_groups_after IS DISTINCT FROM v_groups_before THEN
    RAISE EXCEPTION 'MYK9-1930 backfill changed the ledger: % rows / % before, % rows / % after',
      v_rows_before, v_sum_before, v_rows_after, v_sum_after;
  END IF;

  -- No attached entry keeps an entry-parented ledger row.
  IF EXISTS (SELECT 1 FROM public.show_payments sp WHERE sp.entry_id = ANY (v_attached)) THEN
    RAISE EXCEPTION 'MYK9-1930 backfill left an entry-parented ledger row on an attached entry';
  END IF;

  RAISE NOTICE 'MYK9-1930 backfill: % entr(ies) attached to their entry forms; % refunded entr(ies) left formless because their refunded amount is not recorded (entry_form_backfill_refund_unknown); ledger unchanged (% rows, % total)',
    cardinality(v_attached), v_excluded, v_rows_after, v_sum_after;
  RETURN cardinality(v_attached);
END;
$backfill$;

COMMENT ON FUNCTION private.backfill_entry_forms() IS
  'MYK9-1930: the one-time backfill (run by 20261119173700). Gives every entry_form_backfill_candidate its exhibitor''s entry form, moving its desk money onto the form without changing the ledger''s totals. Refuses (raises) if the ledger or any form''s amount due would move otherwise. Kept for the behavioural test; a second run finds nothing to do.';

REVOKE ALL ON FUNCTION private.backfill_entry_forms() FROM PUBLIC, anon, authenticated;

SELECT private.backfill_entry_forms();

COMMIT;
