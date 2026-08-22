# deliver-trial-packet

Authenticated, show-scoped delivery for immutable emergency packet PDFs in the private `trial-packets` bucket. Recipients are derived from current secretary, trial-secretary, and club-admin role records; the request cannot choose email addresses.

This function is the **manual** path: a show manager pressed the button and the browser uploaded the PDF. Everything after authorization — recipient resolution, the signed link, the send-once check, and the audit row — lives in [`../_shared/trialPacket/`](../_shared/trialPacket/) so the automated generator (MYK9-228) delivers through the same code rather than a second copy.

Deploy only after `20260820220000_emergency_trial_packets.sql` is applied:

```bash
supabase functions deploy deliver-trial-packet --no-verify-jwt
```

The shared HTTP handler validates the bearer token internally. Deployment and linked-database migration are shared-system writes and require explicit approval.
