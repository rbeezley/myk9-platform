import { useState, useEffect, useMemo } from 'react';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useUserQuery } from '@/hooks/queries/useUsersQuery';
import { useUpdatePerson } from '@/hooks/useUsers';
import { useAuthContext } from '@/hooks/useAuthContext';
import { notifications, actionNotifications } from '@/lib/notifications';

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
  const { data: person, isLoading } = useUserQuery(personId || '');
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
    setValues((prev) => ({ ...prev, [field]: value }));
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
      notifications.error(err instanceof Error ? err.message : 'Failed to update profile.');
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
