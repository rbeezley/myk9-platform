# Early-Access Wizard Surface

## Context

myK9Show is months away from full release, but the show-setup slice — creation wizard, premium/heritage landing page, mail-in entry blank, confirmation email — is already polished. We're shipping that slice now to waitlist signups so:

- Real secretaries stress-test the only part of the app that's "done"
- Mail-in / confirmation / landing edge cases surface before scoring/check-in get built on top of assumptions
- The waitlist becomes a real funnel: "join the list → get early access" beats "we'll email you"

The mechanism is a build-time env flag plus a self-serve invite path: pick "Club / secretary" on the waitlist form, get a magic-link invite, sign in, land directly in the wizard. Everyone else who joins the waitlist (exhibitors, judges) stays parked for future cohorts.

## Approach

Single Vercel deployment, `VITE_PUBLIC_SURFACE=wizard` toggle. Existing roles/RBAC stay intact — secretaries-from-the-waitlist get the real `secretary` role, not a parallel one. The surface flag is the only thing that distinguishes the gated deployment from the full app. Site admins bypass the gate, keeping internal team access to the full app on the same deployment.

### Flow

1. Visitor opens `/` → sees marketing landing (`WaitlistFormLanding`)
2. Fills form with the existing "Club / secretary" tag → row inserted into `platform_waitlist` (role stored as `club_official`)
3. Form invokes `send-waitlist-invite` edge function fire-and-forget → stamps `access_granted_at` + `access_invite_sent_at`, sends Resend magic-link email
4. Recipient clicks link → Supabase Auth signs them in → the existing `handle_new_user` trigger (migration 131) creates the `people` row and grants the exhibitor role; the new `zz_grant_early_access_secretary` trigger fires after it and additionally grants the global `secretary` role when the email matches a granted waitlist row
5. Route gate (active because `VITE_PUBLIC_SURFACE=wizard`) routes them into the wizard surface; everything else 404s
6. Non-secretary waitlist signups sit untouched in the table — no invite, no `access_granted_at`. Future cohorts handled manually via SQL.

## Files

### Database — `supabase/migrations/20260517120000_waitlist_early_access.sql`

- Adds `access_granted_at` and `access_invite_sent_at` to `platform_waitlist`, plus a partial index on granted rows
- Creates `public.grant_early_access_secretary_role()` and the `zz_grant_early_access_secretary` trigger on `auth.users` (name prefixed `zz_` so it sorts after `on_auth_user_created` and runs once the people row exists). Trigger:
  1. Bails unless an email-matching waitlist row exists with `role = 'club_official'` and `access_granted_at IS NOT NULL`
  2. Looks up the freshly-created `people.id` via `auth_user_id`
  3. Re-activates an existing global (no club/show scope) `secretary` user_role, or inserts a fresh one (mirrors the upsert pattern in `handle_new_user`)

No schema change to the `role` column — it's free text. We reuse `'club_official'` since the landing form's existing "Club / secretary" tag maps there.

### Edge function — `supabase/functions/send-waitlist-invite/index.ts`

Reuses the Resend pattern from `send-confirmation-email`. Steps:

1. Look up waitlist row by lowercased email; success no-op if not found, role ≠ `club_official`, or `access_invite_sent_at` already set (idempotent)
2. `supabase.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: <site>/secretary/create-show/wizard } })`
3. Send styled invite via Resend (subject: "You're in — myK9Show early access"), `Idempotency-Key: waitlist-invite-<row.id>`
4. Update row: `access_granted_at = coalesce(existing, now())`, `access_invite_sent_at = now()`

Deploy with `--no-verify-jwt`. Required secrets in dashboard: `RESEND_API_KEY`, `SITE_URL`.

### Waitlist form — `apps/myk9show/src/components/landing/v2/WaitlistFormLanding.tsx`

- Keeps the existing three radios (Exhibitor / Club / secretary / Judge) — no new tag
- Defines `EARLY_ACCESS_ROLE = 'club_official'`. After a successful insert, if `role === EARLY_ACCESS_ROLE`, invokes `supabase.functions.invoke('send-waitlist-invite', { body: { email } })` fire-and-forget
- Success state branches: secretaries see "Check your email" (with the email address echoed); other roles see the original "You're on the list" message
- Duplicate-email path (Postgres `23505`) does NOT re-invoke the invite — the edge function would short-circuit anyway, but we save the round-trip

### Surface gate — `apps/myk9show/src/config/surface.ts` + `components/WizardSurfaceGate.tsx`

```ts
export type Surface = 'wizard' | 'full';
const raw = import.meta.env.VITE_PUBLIC_SURFACE;
export const currentSurface: Surface = raw === 'wizard' ? 'wizard' : 'full';
export const isWizardSurface = currentSurface === 'wizard';
```

Allowlisted paths: `/`, the auth/recovery routes, `/account`, `/secretary`, `/secretary/dashboard`, `/secretary/create-show`, `/secretary/create-show/wizard`, `/secretary/shows/:showId`, `/secretary/settings`, `/shows/:id`, `/shows/:id/*`. Matching uses React Router's `matchPath`.

- `WizardSurfaceGate` is a layout `<Route element>` wrapping the entire route tree. It calls `useLocation` + `useAuthContext`, returns `<Outlet />` when the surface is full OR the user is a site admin OR the path is in the allowlist; otherwise renders `<NotFoundPage />`.
- `unifiedSidebarConfig` filters nav items by `isPathInWizardAllowlist(item.href)` and drops empty groups when the wizard surface is active (and the viewer isn't a site admin)
- `.env.example` documents `VITE_PUBLIC_SURFACE=full|wizard`

## Verification

### Pre-merge — done

- `pnpm typecheck` and lint clean on touched files
- 13 unit tests pass:
  - `src/config/surface.test.ts` — default surface, full-mode allows everything, wizard allowlist accepts wizard/marketing/auth/show landing paths and rejects scoring/admin/exhibitor/judge/results-control/reports/check-in
  - `src/components/landing/v2/__tests__/WaitlistFormLanding.test.tsx` — exhibitor path doesn't invoke the function, "Club / secretary" path invokes with the right payload and shows the check-your-email success, duplicate (`23505`) does NOT re-invoke, error handling unchanged

### Manual end-to-end on staging (post-push)

1. Push migration to Supabase, deploy `send-waitlist-invite` with `--no-verify-jwt`, set `RESEND_API_KEY` + `SITE_URL` secrets
2. Set `VITE_PUBLIC_SURFACE=wizard` in Vercel and redeploy
3. Submit waitlist form as "Club / secretary" from `/`
4. Receive invite email; click magic link
5. Land signed in; verify route gate (try `/scoring/...` → 404, try `/secretary/create-show/wizard` → loads with secretary role granted)
6. Complete the wizard for a heritage show; verify published landing renders at `/shows/:id`
7. Submit the same email a second time — verify the form short-circuits on `23505` and the edge function does not re-send (`access_invite_sent_at` guard works)

### Reversibility

To shut early access off: set `VITE_PUBLIC_SURFACE=full` in Vercel and redeploy. The waitlist rows and granted secretary roles remain valid; users see the full app instead of the gated surface. To revoke a specific user: set their `user_roles.is_active = false` for the secretary role and clear `access_granted_at` so a fresh submit doesn't re-trigger an invite.

## Open follow-ups

- **Personal club.** The grant-secretary trigger assigns the role globally (no club_id scope). The wizard collects club details during show creation, so this is fine for v1, but if the wizard assumes a pre-existing club row, we'll need to either auto-create `${name}'s Shows` on first sign-in or update the wizard to handle "no club yet". Confirm in real-traffic testing.
- **Cohort throttling.** Currently every "Club / secretary" signup gets an immediate invite (auto-grant). If volume gets noisy, add a `pending_review` state and require admin approval to flip `access_granted_at`.
- **Admin UI.** No site-admin page exists yet for browsing the waitlist; site admins can read the table directly via Supabase Studio.
