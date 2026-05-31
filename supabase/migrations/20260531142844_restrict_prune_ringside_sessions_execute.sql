revoke all on function public.prune_stale_ringside_sessions() from public;
revoke all on function public.prune_stale_ringside_sessions() from anon;
revoke all on function public.prune_stale_ringside_sessions() from authenticated;

grant execute on function public.prune_stale_ringside_sessions() to service_role;
