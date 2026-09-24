import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUpdatePerson } from '@/hooks/useUsers';
import { mapDbUserToUser } from '@/hooks/queries/useUsersQuery';
import { useAuthContext } from '@/hooks/useAuthContext';
import { notifications } from '@/lib/notifications';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import { friendlyDbError } from '@/utils/friendlyDbError';
import {
  juniorHandlerNumbersForSave,
  juniorHandlerNumbersPatch,
} from '@/features/registries/juniorHandlerPolicy';
import { PEOPLE_MAPPER_COLUMNS } from '@/services/database/users/peopleColumns';
import { loadPersonPrivateDetails } from '@/services/database/users/personPrivate';

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  /** MYK9-570: ISO `YYYY-MM-DD`, or '' when unknown. */
  dateOfBirth: string;
  /**
   * MYK9-570: the WHOLE registry-keyed map, not one field per rendered input —
   * the form renders inputs only for the registries that issue a number, and
   * rebuilding the map from those dropped any other stored key on save.
   */
  juniorHandlerNumbers: Record<string, string>;
}

interface ProfileFormErrors {
  firstName?: string;
  dateOfBirth?: string;
  lastName?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

/** Two junior-number maps agree once both are shaped the way a save shapes them. */
function sameJuniorHandlerNumbers(
  a: Record<string, string>,
  b: Record<string, string> | undefined
): boolean {
  const left = juniorHandlerNumbersForSave(a);
  const right = juniorHandlerNumbersForSave(b);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

/**
 * MYK9-570. Empty is fine (the field is optional); a present value must be a
 * real calendar date in the past, matching the CHECK the migration adds and the
 * same rule the secretary's edit panel applies.
 */
function validateDateOfBirth(value: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Please enter a date of birth as YYYY-MM-DD';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return 'Please enter a real date of birth';
  if (Number(value.slice(0, 4)) < 1900) return 'Please enter a date of birth after 1900';
  if (parsed.getTime() > Date.now()) return 'A date of birth cannot be in the future';
  return undefined;
}

/**
 * Query the current user's person record directly by auth_user_id.
 * This avoids depending on the Zustand store being loaded first.
 * Exported so other components (e.g. AppHeader) can read profileImage
 * from the same shared React Query cache entry.
 */
export function useCurrentUserPerson(authUserId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.users.all, 'currentProfile', authUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select(PEOPLE_MAPPER_COLUMNS)
        .eq('auth_user_id', authUserId!)
        .is('deleted_at', null)
        .maybeSingle();

      if (error || !data) return null;

      const person = mapDbUserToUser(data);
      // MYK9-664: the person's own date of birth and junior numbers live in
      // `people_private`, which RLS lets them (and site admins) read. A failed
      // read leaves both undefined rather than failing the whole profile.
      const own = await loadPersonPrivateDetails([person.id])
        .then(byId => ({ loaded: true as const, details: byId.get(person.id) }))
        .catch(() => ({ loaded: false as const, details: undefined }));
      return {
        ...person,
        // Whether the stored values were actually read. A save must not send
        // blanks (which clear) on the strength of a read that failed.
        privateDetailsLoaded: own.loaded,
        ...(own.details?.dateOfBirth && { dateOfBirth: own.details.dateOfBirth }),
        ...(own.details?.juniorHandlerNumbers && {
          juniorHandlerNumbers: own.details.juniorHandlerNumbers,
        }),
      };
    },
    enabled: !!authUserId,
  });
}

export function useProfileForm() {
  const { user: authUser } = useAuthContext();
  const { data: person, isLoading } = useCurrentUserPerson(authUser?.id);
  const personId = person?.id || null;
  const updatePerson = useUpdatePerson();

  const [values, setValues] = useState<ProfileFormValues>({
    firstName: '',
    lastName: '',
    phone: '',
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
    dateOfBirth: '',
    juniorHandlerNumbers: {},
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
        dateOfBirth: person.dateOfBirth || '',
        juniorHandlerNumbers: { ...(person.juniorHandlerNumbers ?? {}) },
      });
    }
  }, [person]);

  /**
   * `value` may be an UPDATER — `(previous) => next` — for a field derived from
   * its own current value. Two changes to different keys of the junior-number
   * map in one tick otherwise both read the same stale render closure and the
   * first is lost (MYK9-570 round 2).
   */
  const setValue = <Field extends keyof ProfileFormValues>(
    field: Field,
    value:
      ProfileFormValues[Field] | ((previous: ProfileFormValues[Field]) => ProfileFormValues[Field])
  ) => {
    setValues(prev => ({
      ...prev,
      [field]:
        typeof value === 'function'
          ? (value as (p: ProfileFormValues[Field]) => ProfileFormValues[Field])(prev[field])
          : value,
    }));
  };

  // Validation
  const errors = useMemo<ProfileFormErrors>(() => {
    const e: ProfileFormErrors = {};
    if (!values.firstName.trim()) e.firstName = 'First name is required';
    if (!values.lastName.trim()) e.lastName = 'Last name is required';
    // MYK9-570: a future date of birth would make every junior derivation
    // negative, and the migration's CHECK refuses anything before 1900.
    const dobError = validateDateOfBirth(values.dateOfBirth);
    if (dobError) e.dateOfBirth = dobError;
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
      values.zipCode !== (person.zipCode || '') ||
      values.dateOfBirth !== (person.dateOfBirth || '') ||
      // Compared through the same shaping the save applies, so re-typing the
      // same number with a stray space is not "dirty".
      !sameJuniorHandlerNumbers(values.juniorHandlerNumbers, person.juniorHandlerNumbers)
    );
  }, [values, person]);

  const save = async () => {
    if (!person) return;
    setSaveError(null);
    setSaveSuccess(false);
    if (!isValid) {
      const message = Object.values(errors)[0] ?? 'Please check your profile details.';
      notifications.error(message);
      setSaveError(message);
      return;
    }
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
        // MYK9-570 / MYK9-664. '' clears the date. The person sees what is
        // stored, so every registry key is sent and a blank input clears it.
        dateOfBirth:
          person.privateDetailsLoaded || values.dateOfBirth ? values.dateOfBirth : undefined,
        juniorHandlerNumbers: juniorHandlerNumbersPatch(values.juniorHandlerNumbers, {
          clearBlanks: person.privateDetailsLoaded,
        }),
      });
      // Explicit duration at this callsite: the profile save toast previously
      // persisted indefinitely (defaulted to no auto-dismiss) and stuck around
      // across navigations. Auto-dismiss after ~4s.
      notifications.success(
        `Profile "${values.firstName} ${values.lastName}" updated successfully`,
        { duration: 4000 }
      );
      setSaveSuccess(true);
    } catch (err) {
      const message = friendlyDbError(err, 'Failed to update profile.');
      notifications.error(message);
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (person) {
      setValues({
        firstName: person.firstName || '',
        lastName: person.lastName || '',
        phone: person.phone || '',
        streetAddress: person.streetAddress || person.address || '',
        city: person.city || '',
        state: person.state || '',
        zipCode: person.zipCode || '',
        dateOfBirth: person.dateOfBirth || '',
        juniorHandlerNumbers: { ...(person.juniorHandlerNumbers ?? {}) },
      });
    }
  };

  const clearSaveStatus = () => {
    setSaveError(null);
    setSaveSuccess(false);
  };

  return {
    values,
    setValue,
    errors,
    isValid,
    isDirty,
    saving,
    saveError,
    saveSuccess,
    clearSaveStatus,
    save,
    reset,
    isLoading,
    person,
    personId,
    email: authUser?.email || '',
  };
}
