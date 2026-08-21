# deliver-trial-packet

Authenticated, show-scoped delivery for immutable emergency packet PDFs in the private `trial-packets` bucket. Recipients are derived from current secretary, trial-secretary, and club-admin role records; the request cannot choose email addresses.

Deploy only after `20260820220000_emergency_trial_packets.sql` is applied:

```bash
supabase functions deploy deliver-trial-packet --no-verify-jwt
```

The shared HTTP handler validates the bearer token internally. Deployment and linked-database migration are shared-system writes and require explicit approval.
