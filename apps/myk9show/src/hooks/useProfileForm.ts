import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUpdatePerson } from '@/hooks/useUsers';
import { mapDbUserToUser } from '@/hooks/queries/useUsersQuery';
import { useAuthContext } from '@/hooks/useAuthContext';
import { notifications, actionNotifications } from '@/lib/notifications';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';

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

/**
 * Query the current user's person record directly by auth_user_id.
 * This avoids depending on the Zustand store being loaded first.
 */
function useCurrentUserPerson(authUserId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.users.all, 'currentProfile', authUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .eq('auth_user_id', authUserId!)
        .is('deleted_at', null)
        .single();

      if (error || !data) return null;

      return mapDbUserToUser(data);
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
    if (!person) return;
    if (!isValid) {
      notifications.error(Object.values(errors)[0] ?? 'Please check your profile details.');
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
      });
      actionNotifications.updated('Profile', `${values.firstName} ${values.lastName}`);
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to update profile.');
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
      });
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
    reset,
    isLoading,
    person,
    personId,
    email: authUser?.email || '',
  };
}
