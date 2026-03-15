# Profile Page Design

**Date:** 2026-03-14
**Status:** Approved

## Overview

Build a dedicated `/profile` page where any authenticated user (all roles) can view and edit their personal information, upload a profile photo, and manage their address. Replaces the current `ProfileRedirect` component that bounces to a read-only person detail view.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Page vs panel | Full page | Too many fields for a slide-out; consistent with PreferencesPage |
| Profile vs Preferences | Separate pages | "Who am I" (identity) vs "How the app behaves" (preferences) are different mental models |
| Save behavior | Single Save button | One form, one submit — simpler than per-card saves |
| Photo upload | Immediate on select | File uploads are async; save to Supabase Storage immediately, update person record |
| Password change | Link to Preferences > Security | Reuse existing SecuritySettings; avoid duplication |
| Address fields | Required | AKC/UKC reporting requires exhibitor addresses |
| Scope | All roles | Every authenticated user needs profile editing, not just exhibitors |

## Page Layout

Single-column, centered container (`max-w-2xl`) with card-based sections:

### 1. Profile Photo Card
- Circular avatar with camera icon overlay on hover (reuse pattern from `ProfileHeader.tsx`)
- Click opens file picker (jpg/png/webp, max 5MB)
- Loading spinner overlay during upload
- Initials fallback when no photo (via `getInitials()`)

### 2. Personal Information Card
- **First name** — required, text input
- **Last name** — required, text input
- **Email** — read-only, displayed from Supabase Auth (shown but not editable)
- **Phone** — optional, text input

### 3. Address Card
- **Street** — required, text input
- **City** — required, text input
- **State** — required, text input
- **Zip** — required, text input

### Footer
- **Save** button (disabled when form is clean or invalid)
- "Need to change your password?" link → `/preferences` (security tab)

## Data Flow

1. **Load:** `useCurrentUserPersonId()` → `useUserQuery(personId)` → pre-fill all fields
2. **Edit:** Local form state tracks changes, dirty detection enables Save button
3. **Save (form):** Validate → `useUpdatePerson()` mutation → updates `people` table → success toast
4. **Save (photo):** File select → validate type/size → upload to `profile-avatars/{userId}/avatar.{ext}` in Supabase Storage → update `photo_url` on person record via `useUpdatePerson()` → avatar refreshes

## Validation

| Field | Rule |
|-------|------|
| First name | Required, trimmed |
| Last name | Required, trimmed |
| Email | Read-only (not editable) |
| Phone | Optional, no format enforcement |
| Street | Required |
| City | Required |
| State | Required |
| Zip | Required |
| Photo | Image type (jpg/png/webp), max 5MB |

## File Structure

```
apps/myk9show/src/pages/ProfilePage.tsx       — main page component
apps/myk9show/src/hooks/useProfileForm.ts     — form state, validation, submit
apps/myk9show/src/hooks/useAvatarUpload.ts    — Supabase Storage upload logic
```

## Routing Changes

- `/profile` route: swap `ProfileRedirect` → `ProfilePage` (lazy loaded)
- `/exhibitor/profile` and `/exhibitor/account` routes: also point to `ProfilePage`
- User dropdown "My Profile" link: no change needed (already points to `/profile`)

## Existing Code to Reuse

- `ProfileHeader.tsx` — avatar display pattern with camera overlay
- `useUpdatePerson()` — mutation for updating people records
- `useUserQuery(id)` — fetching person data
- `useCurrentUserPersonId()` — getting current user's person ID
- `getInitials()` — initials fallback for avatar
- `Avatar`, `AvatarImage`, `AvatarFallback` — shadcn/ui avatar components
- `Card`, `Input`, `Label`, `Button` — shadcn/ui form components

## Not In Scope

- Avatar cropping/resizing (future enhancement)
- Email change (managed by Supabase Auth, complex flow)
- Password change (handled by existing SecuritySettings in Preferences)
- Additional exhibitor-specific fields (subscription, handler — managed elsewhere)
