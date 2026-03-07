import React, { useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserFormData } from './UserEditPanel.types';

interface BasicInfoTabProps {
  data: UserFormData;
  errors: string[];
  updateData: (updates: Partial<UserFormData>) => void;
  hasAdminPermission: boolean;
  canEditAdvancedFields: boolean;
  onOpenPhotoModal: () => void;
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({
  data,
  errors,
  updateData,
  hasAdminPermission,
  canEditAdvancedFields,
  onOpenPhotoModal,
}) => {
  const handleInputChange = useCallback(
    (field: keyof UserFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        updateData({ [field]: e.target.value });
      },
    [updateData]
  );

  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Personal Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Profile Image Section */}
        <div className="flex items-center gap-4 pb-4 border-b border-border/30">
          <Avatar className="h-16 w-16">
            <AvatarImage src={data.profileImage} alt={`${data.firstName} ${data.lastName}`} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
              {data.firstName?.[0]}
              {data.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
              Profile Picture
            </Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenPhotoModal}
                className="gap-2"
              >
                <Camera className="h-4 w-4" />
                Change Photo
              </Button>
              {data.profileImage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateData({ profileImage: '' })}
                  className="gap-2 text-muted-foreground hover:text-destructive"
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label
              htmlFor="firstName"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              First Name *
            </Label>
            <Input
              id="firstName"
              value={data.firstName}
              onChange={handleInputChange('firstName')}
              placeholder="Enter first name"
              className={cn(errors.some(e => e.includes('First name')) && 'border-destructive')}
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="lastName"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Last Name *
            </Label>
            <Input
              id="lastName"
              value={data.lastName}
              onChange={handleInputChange('lastName')}
              placeholder="Enter last name"
              className={cn(errors.some(e => e.includes('Last name')) && 'border-destructive')}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="user-edit-email"
            className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
          >
            Email Address *
          </Label>
          <Input
            id="user-edit-email"
            type="email"
            autoComplete="email"
            value={data.email}
            onChange={handleInputChange('email')}
            placeholder="Enter email address"
            name="email"
            className={cn(
              errors.some(e => e.includes('email') || e.includes('Email')) && 'border-destructive'
            )}
          />
        </div>

        {/* Role Management - Admin Only */}
        {hasAdminPermission && (
          <>
            <Separator />
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Role Management
              </h4>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                  User Roles
                </Label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      'exhibitor',
                      'handler',
                      'judge',
                      'secretary',
                      'chairman',
                      'steward',
                      'admin',
                    ] as const
                  ).map(role => {
                    const isSelected = data.roles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => {
                          const newRoles = isSelected
                            ? data.roles.filter(r => r !== role)
                            : [...data.roles, role];
                          updateData({ roles: newRoles });
                        }}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200',
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-input border-0 text-muted-foreground hover:text-foreground hover:bg-muted'
                        )}
                      >
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </button>
                    );
                  })}
                </div>
                {data.roles.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No roles assigned. Users with no roles are considered Members.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {canEditAdvancedFields && (
          <>
            <Separator />
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Additional Information
              </h4>

              <div className="space-y-2">
                <Label
                  htmlFor="bio"
                  className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                >
                  Bio
                </Label>
                <textarea
                  id="bio"
                  value={data.bio || ''}
                  onChange={handleInputChange('bio')}
                  placeholder="Enter bio or description"
                  className="min-h-[80px] w-full rounded-xl border-0 bg-input px-3.5 py-2.5 text-sm font-medium tracking-tight placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background focus-visible:shadow-sm transition-all duration-200"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="website"
                  className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                >
                  Website
                </Label>
                <Input
                  id="website"
                  type="url"
                  value={data.website || ''}
                  onChange={handleInputChange('website')}
                  placeholder="https://example.com"
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
