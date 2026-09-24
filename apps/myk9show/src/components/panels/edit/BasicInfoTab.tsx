import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Camera } from 'lucide-react';
import {
  decidePersonEmailLock,
  fetchPersonEmailLockFacts,
  type PersonEmailLock,
} from '@/services/database/users';
import { JuniorHandlerFields } from '@/components/common/JuniorHandlerFields';
import type { RegistryId } from '@/features/registries';
import { useEditPanel } from './useEditPanel';
import type { UserFormData } from './UserEditPanel.types';

/**
 * Whether the editor may offer to change this person's email: see
 * `decidePersonEmailLock` for the rule and its database twin (MYK9-136,
 * MYK9-710). The facts are read here rather than taken from the caller: the
 * admin roster comes from the `get_admin_user_list` RPC, which does not return
 * `auth_user_id` at all, and no caller loads roles or entries for the person.
 *
 * Unknown reads as "editable". The refusal itself lives in the database, and
 * the panel reports a refused save; this only decides whether to offer an edit
 * that would be refused.
 */
function usePersonEmailLock(
  personId: string | undefined,
  isSiteAdmin: boolean
): PersonEmailLock | { locked: 'pending' } {
  const query = useQuery({
    queryKey: ['personEmailLockFacts', personId],
    queryFn: async () => {
      if (!personId) return null;
      return fetchPersonEmailLockFacts(personId);
    },
    enabled: !!personId,
    // Read fresh on every open: an entry or role added since the last open
    // changes the answer, and the database refuses the save if we guess wrong.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    // Opt out of the global `placeholderData: prev => prev` (lib/queryClient.ts,
    // MYK9-709), which would show the previous person's facts for this one.
    placeholderData: () => undefined,
  });
  // While the fresh read is in flight, show neither a cached nor a borrowed
  // answer: a neutral read-only field until the facts for THIS open arrive.
  if (query.isFetching || query.isPlaceholderData) return { locked: 'pending' };
  return decidePersonEmailLock({ isSiteAdmin, facts: query.data ?? null });
}

const EMAIL_LOCK_NOTE = {
  pending: 'Checking whether this email can be changed...',
  'sign-in': "This is the address they sign in with, so it can't be changed here.",
  'site-admin-only':
    'Only a site admin can change this email once the person has entries or a sign-in account.',
} as const;

interface BasicInfoTabProps {
  personId?: string;
  hasAdminPermission: boolean;
  canEditAdvancedFields: boolean;
  onOpenPhotoModal: () => void;
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({
  personId,
  hasAdminPermission,
  canEditAdvancedFields,
  onOpenPhotoModal,
}) => {
  const { data, form } = useEditPanel<UserFormData>();
  // `admin:manage` is held by site_admin only, which is who the database lets
  // change a locked email.
  const emailLock = usePersonEmailLock(personId, hasAdminPermission);

  const firstNameError = form?.getError('firstName');
  const lastNameError = form?.getError('lastName');
  const emailError = form?.getError('email');
  const dateOfBirthError = form?.getError('dateOfBirth');
  const emailInputProps = { id: 'email', type: 'email', value: data.email, name: 'email' } as const;

  return (
    <div className="space-y-6">
      {/* Profile Picture */}
      <Card className="border-0 shadow-none bg-transparent">
        <CardContent className="p-0">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {data.profileImage ? (
                <AvatarImage src={data.profileImage} alt={`${data.firstName} ${data.lastName}`} />
              ) : null}
              <AvatarFallback className="text-lg bg-muted">
                {data.firstName && data.lastName ? (
                  `${data.firstName[0]}${data.lastName[0]}`.toUpperCase()
                ) : (
                  <User className="h-6 w-6" />
                )}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Profile Picture
              </p>
              <Button variant="outline" size="sm" onClick={onOpenPhotoModal} className="gap-2">
                <Camera className="h-3.5 w-3.5" />
                Change Photo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Name Fields */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="First Name" fieldId="firstName" required error={firstNameError}>
          <Input
            id="firstName"
            value={data.firstName}
            onChange={e => form?.setValue('firstName', e.target.value)}
            onBlur={() => form?.touchField('firstName')}
            placeholder="Enter first name"
            name="firstName"
            {...form?.getFieldProps('firstName')}
          />
        </FormField>
        <FormField label="Last Name" fieldId="lastName" required error={lastNameError}>
          <Input
            id="lastName"
            value={data.lastName}
            onChange={e => form?.setValue('lastName', e.target.value)}
            onBlur={() => form?.touchField('lastName')}
            placeholder="Enter last name"
            name="lastName"
            {...form?.getFieldProps('lastName')}
          />
        </FormField>
      </div>

      {/* Email — read-only once the person can sign in (their contact address
          IS their sign-in address, MYK9-136), and for anyone but a site admin
          once the person has entries or roles (MYK9-710): the database refuses
          those edits, so the editor does not offer them. */}
      <FormField label="Email Address" fieldId="email" required error={emailError}>
        {emailLock.locked !== false ? (
          <>
            <Input
              {...emailInputProps}
              readOnly
              aria-readonly="true"
              className="cursor-default bg-muted text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {EMAIL_LOCK_NOTE[emailLock.locked === 'pending' ? 'pending' : emailLock.reason]}
            </p>
          </>
        ) : (
          <Input
            {...emailInputProps}
            onChange={e => form?.setValue('email', e.target.value)}
            onBlur={() => form?.touchField('email')}
            placeholder="Enter email address"
            {...form?.getFieldProps('email')}
          />
        )}
      </FormField>

      {/* MYK9-570. Junior handler status is derived from the date of birth and the
          trial date, so this block sets the inputs, never a flag. MYK9-664: and
          it only SETS them — a manager never sees the stored date of birth. */}
      <Separator />
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Junior handler
        </h4>
        <JuniorHandlerFields
          idPrefix="user-edit"
          writeOnly
          dateOfBirth={data.dateOfBirth ?? ''}
          juniorHandlerNumbers={data.juniorHandlerNumbers ?? {}}
          dateOfBirthError={dateOfBirthError}
          onDateOfBirthChange={value => form?.setValue('dateOfBirth', value)}
          // Updater, not a spread of the render closure: two registries changed
          // in one tick (autofill, a paste into both) would otherwise lose the
          // first.
          onJuniorHandlerNumberChange={(registryId: RegistryId, value) =>
            form?.setValue('juniorHandlerNumbers', (previous: unknown) => ({
              ...((previous as Record<string, string>) ?? {}),
              [registryId]: value,
            }))
          }
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Role assignments are managed from the{' '}
        <Link className="text-primary underline underline-offset-2" to="/admin/users">
          User Management
        </Link>{' '}
        page so club and show scopes remain visible.
      </p>

      {canEditAdvancedFields && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Additional Information
            </h4>

            <FormField label="Bio" fieldId="bio">
              <Input
                id="bio"
                value={data.bio || ''}
                onChange={e => form?.setValue('bio', e.target.value)}
                onBlur={() => form?.touchField('bio')}
                placeholder="Enter bio or description"
                name="bio"
              />
            </FormField>
          </div>
        </>
      )}
    </div>
  );
};
