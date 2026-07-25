-- Advisor sweep: restrict_enrollment_money_columns() (20260717120000) was
-- created without revoking the default PUBLIC execute grant, unlike every
-- analogous trigger-guard function in this codebase (restrict_entry_refund_
-- columns, restrict_payment_status_update, restrict_support_ticket_update_
-- columns — all postgres/service_role only). Not exploitable for money
-- movement (calling it outside a trigger context errors on the undefined
-- NEW/OLD pseudo-records), but it's unnecessary PostgREST RPC surface and
-- breaks the project's established convention. Caught by get_advisors
-- (0028/0029 anon/authenticated_security_definer_function_executable) after
-- deploy.

begin;

revoke all on function public.restrict_enrollment_money_columns() from public;
revoke all on function public.restrict_enrollment_money_columns() from anon;
revoke all on function public.restrict_enrollment_money_columns() from authenticated;

commit;
