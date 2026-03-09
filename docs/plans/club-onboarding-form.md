# Club Onboarding Request Form — Implementation Plan

## Problem

New clubs have no self-service way to request onboarding. A club president or secretary who discovers myK9Show has to find Richard's contact info and manually reach out. There's no structured intake process, so onboarding requires back-and-forth to gather club details.

## Goal

A "Get Started" form on the myK9Show landing page that collects the information needed to onboard a new club. **Requires sign-in** — this eliminates bot/spam submissions and means the submitter already has a Supabase auth account, so onboarding is just assigning the CLUB_ADMIN role to their existing user. Submissions go to a Supabase table so Richard gets notified and can act on them from the admin console. MyK9T.com gets a link/banner pointing to this form.

## What the Form Collects

Keep it short — respect the user's time (INTENT.md: "common actions in 1-2 taps").

**Required fields:**

- Club name
- Organization (AKC / UKC / CKC / NASDA / Other)
- Contact person name
- Contact email
- Contact phone

**Optional fields:**

- First show date (helps prioritize urgency)
- Brief message / notes

## Landing Page Placement

Current section order: Hero > Features > Upcoming Shows > Pricing > FAQ

**Insert between Pricing and FAQ.** By this point the visitor understands the product, has seen live shows, and knows the cost. The CTA catches them at peak intent before FAQ handles remaining objections.

## Implementation

### Phase 1: Database + Form Component

1. **Migration** — Create `onboarding_requests` table in Supabase:

   ```sql
   create table onboarding_requests (
     id uuid primary key default gen_random_uuid(),
     auth_user_id uuid not null references auth.users(id),  -- links to signed-in user
     club_name text not null,
     organization text not null,
     contact_name text not null,
     contact_email text not null,
     contact_phone text,
     first_show_date date,
     message text,
     status text not null default 'pending',  -- pending | contacted | onboarded | declined
     created_at timestamptz not null default now(),
     notes text  -- internal notes from admin
   );

   -- [ADDED] Index for admin filtered queries by status
   create index idx_onboarding_requests_status on onboarding_requests(status);

   -- RLS: authenticated users can insert their own, only admins can read/update
   alter table onboarding_requests enable row level security;
   create policy "Authenticated users can submit onboarding request"
     on onboarding_requests for insert
     with check (auth.uid() = auth_user_id);
   create policy "Users can view their own requests"
     on onboarding_requests for select
     using (auth.uid() = auth_user_id);
   create policy "Admins can read onboarding requests"
     on onboarding_requests for select
     using (is_platform_admin());
   create policy "Admins can update onboarding requests"
     on onboarding_requests for update
     using (is_platform_admin());
   ```

2. **Landing page component** — `apps/myk9show/src/components/landing/ClubOnboardingForm.tsx`
   - Glassmorphism card matching landing page style
   - Heading: "Bring Your Club to myK9Show" or "Get Your Club Started"
   - Subtext: "Tell us about your club and we'll get you set up — usually within 24 hours."
   - **Sign-in gate:** If not authenticated, show a friendly message explaining they need to sign in first, with a "Sign In" button that navigates to `/login?returnTo=%23get-started` (the `#get-started` anchor on the landing page). After login, the user is redirected back to the form section. This doubles as anti-spam protection — no bots, no anonymous submissions. [EXPANDED]
   - **Existing request check:** [ADDED] On mount (when authenticated), query `onboarding_requests` for the current user's pending/contacted requests. If one exists, show its status ("Your request is being reviewed — submitted on [date]") instead of the form. If status is `declined`, allow re-submission.
   - **Pre-fill from session:** Auto-populate contact name and email from the authenticated user's profile (auth session metadata or `people` table lookup). User can edit if needed.
   - Form fields with validation (email format, required fields)
   - Organization dropdown (reuse ORGANIZATIONS from wizard)
   - DateTimePicker for optional first show date (showTime=false)
   - On submit, include `auth_user_id: session.user.id` in the insert
   - Success state: confirmation message with "We'll be in touch" and checkmark animation
   - Error state: toast with retry option. [EXPANDED] If error is auth-related (401/403), prompt re-login instead of generic retry — session may have expired mid-form.

3. **Add to Home.tsx** — Import and place between Pricing and FAQ sections, wrapped in FadeIn.

### Phase 2: Admin Console View

4. **Admin page** — `apps/myk9show/src/pages/admin/OnboardingRequestsPage.tsx`
   - Table of requests with status badges (pending/contacted/onboarded/declined)
   - Click to expand details
   - Status dropdown to update
   - **"Onboard" action button** that pre-fills ClubCreationPanel with the request data AND pre-selects the submitter (via `auth_user_id`) as the club admin in the admin picker — since they already have a Supabase account, Richard just creates the club and the role assignment happens automatically
   - Notes field for internal tracking

5. **Admin sidebar** — Add "Onboarding Requests" link with pending count badge.

6. **Route** — `/admin/onboarding` protected by admin route guard.

### Phase 3: MyK9T.com Integration

7. **WordPress banner/link** — Add a prominent link on MyK9T.com pointing to the myK9Show landing page's onboarding section (`myk9-platform-myk9show.vercel.app/#get-started` or similar anchor). This is a manual WordPress edit, not code in this repo.

### Phase 4: Email Notification (Optional)

8. **Supabase webhook or Edge Function** — On new row insert to `onboarding_requests`, send an email notification to Richard. Could use a simple Supabase database webhook → Edge Function → email service (Resend, SendGrid, etc.). Alternatively, just check the admin console periodically until volume warrants automation.

## UX Considerations

- **Sign-in required** — eliminates spam/bots entirely. The sign-in gate is presented as a benefit ("Create your free account to get started") rather than a barrier. Bonus: the submitter already has an account, so onboarding is just a role change from exhibitor to club admin.
- **Pre-filled fields** — contact name and email auto-populate from the user's profile, reducing friction.
- **Mobile-first** — large touch targets (44px+), stacked layout on mobile, readable text (16px+).
- **Calm design** — match landing page glassmorphism style, no aggressive popups or urgency tactics.
- **Confirmation** — after submit, show a clear success state. Consider auto-scrolling to the confirmation.
- **Duplicate prevention** — debounce the submit button, disable after click. Server-side: allow duplicates (club may re-submit if they think it didn't work) but admin can see timestamps.

## Files to Create/Modify

**New files:**

- `supabase/migrations/XXX_onboarding_requests.sql`
- `apps/myk9show/src/components/landing/ClubOnboardingForm.tsx`
- `apps/myk9show/src/pages/admin/OnboardingRequestsPage.tsx` (Phase 2)

**Modified files:**

- `apps/myk9show/src/pages/Home.tsx` (add form section)
- `apps/myk9show/src/components/layout/sidebar/admin-sidebar-config.ts` (add nav item, Phase 2)
- `apps/myk9show/src/App.tsx` or route config (add admin route, Phase 2)

## Testing

**Unit tests** — `apps/myk9show/src/test/components/ClubOnboardingForm.test.tsx` [EXPANDED]

- Form validation (required fields, email format, phone format)
- Sign-in gate renders for unauthenticated users, form renders for authenticated
- Pre-fill populates contact name/email from session
- Existing pending request shows status instead of form
- Submit calls Supabase insert with correct `auth_user_id`
- Success/error states render correctly
- Auth error (401) prompts re-login instead of generic retry
- Debounce prevents double submission

**Integration / manual testing:**

- RLS: authenticated users can insert (with their own `auth_user_id`), only admins can read all
- Mobile responsiveness (44px touch targets, stacked layout)
- Return-to-form flow after login redirect
