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
import { fetchPersonIdentity } from '@/services/database/users';
import { useEditPanel } from './useEditPanel';
import type { UserFormData } from './UserEditPanel.types';

/**
 * Whether this person can sign in. Read here rather than taken from the
 * caller: the admin roster comes from the `get_admin_user_list` RPC, which
 * does not return `auth_user_id` at all, so a passed-down flag would be false
 * for every linked user on the app's main user-management surface — the one
 * place this matters most (MYK9-136).
 *
 * Unknown reads as "editable". The refusal itself lives in `updateUser`, which
 * fails closed; this only decides whether to offer an edit that would be
 * refused.
 */
function usePersonHasSignInAccount(personId?: string) {
  const query = useQuery({
    queryKey: ['personSignInLinkage', personId],
    queryFn: async () => {
      if (!personId) return null;
      return fetchPersonIdentity(personId);
    },
    enabled: !!personId,
    staleTime: 30_000,
  });
  return Boolean(query.data?.authUserId);
}

interface BasicInfoTabProps {
  personId?: string;
  hasAdminPermission: boolean;
  canEditAdvancedFields: boolean;
  onOpenPhotoModal: () => void;
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({
  personId,
  canEditAdvancedFields,
  onOpenPhotoModal,
}) => {
  const { data, form } = useEditPanel<UserFormData>();
  const hasSignInAccount = usePersonHasSignInAccount(personId);

  const firstNameError = form?.getError('firstName');
  const lastNameError = form?.getError('lastName');
  const emailError = form?.getError('email');
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

      {/* Email — read-only once the person can sign in. Their contact address
          and their sign-in address are the same value, and nothing here can
          change the latter, so editing it would only make the two disagree
          (MYK9-136). Mirrors the self-service profile and account pages, which
          have always shown the sign-in address as read-only. */}
      <FormField label="Email Address" fieldId="email" required error={emailError}>
        {hasSignInAccount ? (
          <>
            <Input
              {...emailInputProps}
              readOnly
              aria-readonly="true"
              className="cursor-default bg-muted text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              This is the address they sign in with, so it can&apos;t be changed here.
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
