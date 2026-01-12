# TO-DOS

Items to address in future sessions.

---

## Configure Production Logging Endpoint - 2026-01-12 07:53

- **Configure RemoteTransport for production logging** - Set up external logging endpoint for production environment. **Problem:** LoggingService has RemoteTransport built in but it's not configured - logs only go to localStorage currently, meaning no centralized visibility into production errors/issues. **Files:** `apps/myk9show/src/services/LoggingService.ts:72-129` (RemoteTransport class), `.env.production` (needs `VITE_LOG_ENDPOINT`). **Solution:** Options include: (1) Supabase Edge Function to receive logs, (2) Third-party service like Sentry/LogRocket/DataDog, or (3) Custom endpoint. Need to decide on approach and configure `VITE_LOG_ENDPOINT` environment variable.
