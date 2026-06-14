# Profile Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an editable `/profile` page for all authenticated users to manage their personal info, address, and profile photo.

**Architecture:** Replace `ProfileRedirect` with a new `ProfilePage` component. Extract form logic into `useProfileForm` hook and avatar upload into `useAvatarUpload` hook. Uses existing `useUpdatePerson` mutation and `images` Supabase Storage bucket.

**Tech Stack:** React, TypeScript, shadcn/ui, Supabase Storage, React Query, sonner toasts

**Design doc:** `docs/plans/2026-03-14-profile-page-design.md`

---

### Task 1: Create `useAvatarUpload` hook

**Files:**
- Create: `apps/myk9show/src/hooks/useAvatarUpload.ts`

**Step 1: Create the hook**

```typescript
import { useState } from 'react';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

interface UseAvatarUploadOptions {
  userId: string;
  onSuccess?: (publicUrl: string) => void;
}

export function useAvatarUpload({ userId, onSuccess }: UseAvatarUploadOptions) {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      notifications.error('Please select a JPG, PNG, or WebP image.');
      return;
    }

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      notifications.error('Image must be under 5MB.');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `profiles/${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(path);

      // Append cache-buster so the browser shows the new image
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      onSuccess?.(publicUrl);
      notifications.success('Profile photo updated.');
    } catch (err) {
      notifications.error(
        err instanceof Error ? err.message : 'Failed to upload photo.'
      );
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}
```

**Step 2: Verify types compile**

Run: `cd apps/myk9show && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `useAvatarUpload`

**Step 3: Commit**

```bash
git add apps/myk9show/src/hooks/useAvatarUpload.ts
git commit -m "feat(profile): add useAvatarUpload hook for Supabase Storage"
```

---

### Task 2: Create `useProfileForm` hook

**Files:**
- Create: `apps/myk9show/src/hooks/useProfileForm.ts`

**Step 1: Create the hook**

This hook manages form state, dirty tracking, validation, and save.

```typescript
import { useState, useEffect, useMemo } from 'react';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useUserQuery } from '@/hooks/queries/useUsersQuery'; // [FIXED] correct import
import { useUpdatePerson } from '@/hooks/useUsers';
import { useAuthContext } from '@/hooks/useAuthContext';
import { notifications, actionNotifications } from '@/lib/notifications';
import type { User } from '@/types/user-types';

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

interface ProfileFormErrors {
  firstName?: string;
  lastName?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export function useProfileForm() {
  const personId = useCurrentUserPersonId();
  const { user: authUser } = useAuthContext();
  const { data: person, isLoading } = useUserQuery(personId || ''); // [FIXED] correct hook
  const updatePerson = useUpdatePerson();

  const [values, setValues] = useState<ProfileFormValues>({
    firstName: '',
    lastName: '',
    phone: '',
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
  });
  const [saving, setSaving] = useState(false);

  // Pre-fill from person data
  useEffect(() => {
    if (person) {
      setValues({
        firstName: person.firstName || '',
        lastName: person.lastName || '',
        phone: person.phone || '',
        streetAddress: person.streetAddress || person.address || '',
        city: person.city || '',
        state: person.state || '',
        zipCode: person.zipCode || '',
      });
    }
  }, [person]);

  const setValue = (field: keyof ProfileFormValues, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
  };

  // Validation
  const errors = useMemo<ProfileFormErrors>(() => {
    const e: ProfileFormErrors = {};
    if (!values.firstName.trim()) e.firstName = 'First name is required';
    if (!values.lastName.trim()) e.lastName = 'Last name is required';
    if (!values.streetAddress.trim()) e.streetAddress = 'Street address is required';
    if (!values.city.trim()) e.city = 'City is required';
    if (!values.state.trim()) e.state = 'State is required';
    if (!values.zipCode.trim()) e.zipCode = 'Zip code is required';
    return e;
  }, [values]);

  const isValid = Object.keys(errors).length === 0;

  // Dirty check
  const isDirty = useMemo(() => {
    if (!person) return false;
    return (
      values.firstName !== (person.firstName || '') ||
      values.lastName !== (person.lastName || '') ||
      values.phone !== (person.phone || '') ||
      values.streetAddress !== (person.streetAddress || person.address || '') ||
      values.city !== (person.city || '') ||
      values.state !== (person.state || '') ||
      values.zipCode !== (person.zipCode || '')
    );
  }, [values, person]);

  const save = async () => {
    if (!person || !isValid) return;
    setSaving(true);
    try {
      await updatePerson.mutateAsync({
        ...person,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone.trim() || undefined,
        streetAddress: values.streetAddress.trim(),
        city: values.city.trim(),
        state: values.state.trim(),
        zipCode: values.zipCode.trim(),
      });
      actionNotifications.updated('Profile', `${values.firstName} ${values.lastName}`);
    } catch (err) {
      notifications.error(
        err instanceof Error ? err.message : 'Failed to update profile.'
      );
    } finally {
      setSaving(false);
    }
  };

  return {
    values,
    setValue,
    errors,
    isValid,
    isDirty,
    saving,
    save,
    isLoading,
    person,
    personId,
    email: authUser?.email || '',
  };
}
```

**Step 2: Check types**

Run: `cd apps/myk9show && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `useProfileForm`

**Step 3: Commit**

```bash
git add apps/myk9show/src/hooks/useProfileForm.ts
git commit -m "feat(profile): add useProfileForm hook with validation and dirty tracking"
```

---

### Task 3: Create `ProfilePage` component

**Files:**
- Create: `apps/myk9show/src/pages/ProfilePage.tsx`

**Step 1: Create the page**

```typescript
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { User, Mail, Phone, MapPin, Camera, Loader2, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { useProfileForm } from '@/hooks/useProfileForm';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { useUpdatePerson } from '@/hooks/useUsers';

export default function ProfilePage() {
  const form = useProfileForm();
  const updatePerson = useUpdatePerson();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { upload, uploading } = useAvatarUpload({
    userId: form.personId || '',
    onSuccess: (publicUrl) => {
      // Update person record with new photo URL
      if (form.person) {
        updatePerson.mutate({ ...form.person, profileImage: publicUrl });
      }
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    form.save();
  };

  if (form.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // [ADDED] Handle no-person-record edge case — new users who skipped onboarding
  if (!form.person) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Unable to load your profile.</p>
          <p className="text-sm text-muted-foreground">
            Your account may not have a linked profile yet. Please complete onboarding to set up your profile.
          </p>
          <Button variant="outline" asChild>
            <Link to="/exhibitor/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>

      {/* Profile Photo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile Photo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="relative rounded-full group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Change profile photo"
          >
            <Avatar className="w-32 h-32 border-2 border-muted group-hover:opacity-75 transition-opacity">
              {form.person.profileImage ? (
                <AvatarImage src={form.person.profileImage} alt="Profile photo" />
              ) : (
                <AvatarFallback className="text-4xl font-semibold bg-muted text-muted-foreground">
                  {getInitials(form.values.firstName, form.values.lastName)}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all rounded-full">
              {uploading ? (
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              ) : (
                <Camera className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />
          <p className="text-xs text-muted-foreground">
            Click to upload. JPG, PNG, or WebP, max 5MB.
          </p>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="firstName"
                    value={form.values.firstName}
                    onChange={(e) => form.setValue('firstName', e.target.value)}
                    className="pl-9"
                    required
                    autoComplete="given-name"
                  />
                </div>
                {form.errors.firstName && (
                  <p className="text-sm text-destructive">{form.errors.firstName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name *</Label>
                <Input
                  id="lastName"
                  value={form.values.lastName}
                  onChange={(e) => form.setValue('lastName', e.target.value)}
                  required
                  autoComplete="family-name"
                />
                {form.errors.lastName && (
                  <p className="text-sm text-destructive">{form.errors.lastName}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  disabled
                  className="pl-9 bg-muted"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Email is managed by your authentication account.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  value={form.values.phone}
                  onChange={(e) => form.setValue('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  className="pl-9"
                  autoComplete="tel"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Address</CardTitle>
            <p className="text-sm text-muted-foreground">
              Required for AKC and UKC event reporting.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="streetAddress">Street address *</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="streetAddress"
                  value={form.values.streetAddress}
                  onChange={(e) => form.setValue('streetAddress', e.target.value)}
                  className="pl-9"
                  required
                  autoComplete="street-address"
                />
              </div>
              {form.errors.streetAddress && (
                <p className="text-sm text-destructive">{form.errors.streetAddress}</p>
              )}
            </div>

            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-3 space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={form.values.city}
                  onChange={(e) => form.setValue('city', e.target.value)}
                  required
                  autoComplete="address-level2"
                />
                {form.errors.city && (
                  <p className="text-sm text-destructive">{form.errors.city}</p>
                )}
              </div>
              <div className="col-span-1 space-y-2">
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
                  value={form.values.state}
                  onChange={(e) => form.setValue('state', e.target.value)}
                  required
                  autoComplete="address-level1"
                />
                {form.errors.state && (
                  <p className="text-sm text-destructive">{form.errors.state}</p>
                )}
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="zipCode">Zip code *</Label>
                <Input
                  id="zipCode"
                  value={form.values.zipCode}
                  onChange={(e) => form.setValue('zipCode', e.target.value)}
                  required
                  autoComplete="postal-code"
                />
                {form.errors.zipCode && (
                  <p className="text-sm text-destructive">{form.errors.zipCode}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <Link
            to="/preferences"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <Lock className="h-3.5 w-3.5" />
            Need to change your password?
          </Link>
          <Button
            type="submit"
            disabled={!form.isDirty || !form.isValid || form.saving}
          >
            {form.saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

**Step 2: Check types**

Run: `cd apps/myk9show && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add apps/myk9show/src/pages/ProfilePage.tsx
git commit -m "feat(profile): add ProfilePage with photo, personal info, and address cards"
```

---

### Task 4: Wire up routes and navigation

**Files:**
- Modify: `apps/myk9show/src/routes/publicRoutes.tsx` (lazy import + route swap)
- Modify: `apps/myk9show/src/components/layout/AppHeader.tsx` (dropdown link)

**Step 1: Update route — swap ProfileRedirect for ProfilePage**

In `publicRoutes.tsx`, change the lazy import:

```typescript
// Old:
const ProfileRedirect = lazy(() => import('@/pages/ProfileRedirect'));

// New:
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
```

Then update all three route elements that use `ProfileRedirect` to use `ProfilePage`:
- `/profile` route (~line 245)
- `/exhibitor/profile` route (~line 188)
- `/exhibitor/account` route (~line 198)

Replace `<ProfileRedirect />` with `<ProfilePage />` in each.

**Step 2: Update AppHeader dropdown link**

In `AppHeader.tsx` (~line 289), change the "My Profile" link:

```typescript
// Old:
to={currentPersonId ? `/users/${currentPersonId}` : '/profile'}

// New:
to="/profile"
```

This always goes to `/profile` now — no need for the person ID in the URL.

**Step 3: Check types**

Run: `cd apps/myk9show && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 4: Commit**

```bash
git add apps/myk9show/src/routes/publicRoutes.tsx apps/myk9show/src/components/layout/AppHeader.tsx
git commit -m "feat(profile): wire ProfilePage into routes and update My Profile link"
```

---

### Task 5: Delete `ProfileRedirect.tsx`

**Files:**
- Delete: `apps/myk9show/src/pages/ProfileRedirect.tsx`

**Step 1: Verify no remaining imports**

Search for any remaining references to `ProfileRedirect`:

Run: `grep -r "ProfileRedirect" apps/myk9show/src/`
Expected: No matches (all swapped in Task 4)

**Step 2: Delete the file**

```bash
rm apps/myk9show/src/pages/ProfileRedirect.tsx
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/pages/ProfileRedirect.tsx
git commit -m "chore: remove ProfileRedirect (replaced by ProfilePage)"
```

---

### Task 6: Unit tests [ADDED]

**Files:**
- Create: `apps/myk9show/src/hooks/__tests__/useAvatarUpload.test.ts`
- Create: `apps/myk9show/src/hooks/__tests__/useProfileForm.test.ts`
- Create: `apps/myk9show/src/pages/__tests__/ProfilePage.test.tsx`

**Step 1: Write `useAvatarUpload` tests**

Test cases:
- Rejects files with invalid MIME type (e.g. `application/pdf`) — calls `notifications.error`, does not call `supabase.storage.upload`
- Rejects files over 5MB — calls `notifications.error`
- Successful upload — calls `supabase.storage.upload` with correct path, calls `onSuccess` with public URL
- Failed upload — calls `notifications.error` with the error message
- Sets `uploading` to true during upload, false after

Mock `supabase` storage methods and `notifications`.

**Step 2: Write `useProfileForm` tests**

Test cases:
- Pre-fills form values from person data
- `isDirty` is false when values match person data
- `isDirty` is true when a field changes
- `isValid` is false when required fields are empty
- `isValid` is true when all required fields are filled
- `errors` contains field-specific messages for empty required fields
- `save()` calls `updatePerson.mutateAsync` with trimmed values
- `save()` does nothing when `isValid` is false

Mock `useCurrentUserPersonId`, `useUserQuery`, `useUpdatePerson`, `useAuthContext`.

**Step 3: Write `ProfilePage` smoke test**

Test cases:
- Renders loading state when `isLoading` is true
- Renders error state when no person record found
- Renders all form cards (Profile Photo, Personal Information, Address)
- Save button is disabled when form is clean
- "Need to change your password?" link points to `/preferences`

Mock `useProfileForm` and `useAvatarUpload` to control states.

**Step 4: Run tests**

Run: `cd apps/myk9show && pnpm test -- --run src/hooks/__tests__/useAvatarUpload.test.ts src/hooks/__tests__/useProfileForm.test.ts src/pages/__tests__/ProfilePage.test.tsx`
Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/__tests__/useAvatarUpload.test.ts apps/myk9show/src/hooks/__tests__/useProfileForm.test.ts apps/myk9show/src/pages/__tests__/ProfilePage.test.tsx
git commit -m "test(profile): add unit tests for ProfilePage, useProfileForm, and useAvatarUpload"
```

---

### Task 7: Verify the build works end-to-end

**Step 1: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No errors

**Step 2: Run build**

Run: `cd apps/myk9show && pnpm build`
Expected: Build succeeds

**Step 3: Run dev server and test manually**

Run: `pnpm dev:show`

Manual checks:
- Navigate to `/profile` — page loads with form fields
- Avatar shows initials (or existing photo)
- Fields pre-fill from person record
- Save button is disabled when clean
- Edit a field → Save button enables
- Save → toast notification appears
- Click avatar → file picker opens
- Upload an image → avatar updates
- "Need to change your password?" link → navigates to `/preferences`
- User dropdown "My Profile" → goes to `/profile`

**Step 4: Final commit if any fixes needed**

---

### Task 8: Update TO-DOS.md

**Files:**
- Modify: `TO-DOS.md`

**Step 1: Mark the todo as done**

Change the `Build My Profile page for exhibitors` line from `- [ ]` to `- [x]` and add a completion note.

**Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: mark Profile page todo as complete"
```
