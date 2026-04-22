import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, User, Camera, Edit, PawPrint } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { UserRole } from '@/types/auth-types';
import { FormField } from '@/components/common/FormField';
import { useEditPanel } from '@/components/panels/edit/useEditPanel';
import { calculateAge } from './validation';
import type { DogFormData } from './types';

/**
 * First grapheme of a string, safe for emoji/surrogate pairs.
 * `str[0]` slices by UTF-16 code unit and splits multi-unit characters.
 */
const firstGraphemeUpper = (str: string): string => {
  const first = Array.from(str)[0] ?? '';
  return first.toUpperCase();
};

interface BasicInfoTabProps {
  userRole: UserRole;
  currentUserPersonId?: string | undefined;
  onPhotoOpen: () => void;
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({
  userRole,
  currentUserPersonId,
  onPhotoOpen,
}) => {
  const { form } = useEditPanel<DogFormData>();
  const allPeople = useUserStore(state => state.people);
  const people = useMemo(
    () => allPeople.filter(p => !p.deletedAt && p.status !== 'suspended'),
    [allPeople]
  );

  if (!form) return null;

  const { data: formData } = form;

  return (
    <Card className="group relative overflow-hidden border border-border/30 rounded-2xl transition-all duration-300 hover:shadow-md">
      <CardHeader className="relative">
        <CardTitle className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <div className="p-2 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
            <Heart className="h-5 w-5 text-primary" />
          </div>
          <span>Essential Information</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground/80 mt-1 leading-relaxed">
          Basic details to get started with your dog's profile
        </p>
      </CardHeader>
      <CardContent className="space-y-8 relative">
        {/* Photo Section */}
        <div className="flex items-start gap-6 p-6 bg-gradient-to-r from-muted/20 via-muted/10 to-transparent border border-border/20 rounded-2xl backdrop-blur-sm">
          <button
            type="button"
            onClick={onPhotoOpen}
            className="relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-300 hover:scale-105 active:scale-95"
          >
            <Avatar className="w-24 h-24 border-2 border-border/30 group-hover:border-primary/50 transition-all duration-500 shadow-lg group-hover:shadow-xl group-hover:shadow-primary/10">
              {formData.imageUrl ? (
                <AvatarImage src={formData.imageUrl} alt="Dog photo" className="object-cover" />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/8 text-2xl font-semibold text-primary">
                  {formData.callName ? (
                    firstGraphemeUpper(formData.callName)
                  ) : (
                    <PawPrint className="h-8 w-8 text-primary/60" />
                  )}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center group-hover:bg-black/20 transition-all duration-300 rounded-full">
              <div className="p-3 bg-card rounded-full opacity-0 group-hover:opacity-100 transform scale-50 group-hover:scale-100 transition-all duration-300 shadow-md">
                <Camera className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg">
              <Edit className="w-3 h-3 text-white" />
            </div>
          </button>
          <div className="flex-1 space-y-3">
            <FormField
              label="Call Name"
              fieldId="callName"
              required
              error={form.getError('callName')}
            >
              <Input
                id="callName"
                value={formData.callName}
                onChange={e => form.setValue('callName', e.target.value)}
                onBlur={() => form.touchField('callName')}
                placeholder="Everyday name your dog goes by"
                {...form.getFieldProps('callName')}
              />
            </FormField>
            {formData.callName && (
              <div className="text-xs text-muted-foreground/70 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                Looking great! This will be your dog's primary name.
              </div>
            )}
          </div>
        </div>

        {/* Form Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField label="Gender" fieldId="gender" required error={form.getError('gender')}>
            <Select
              value={formData.gender}
              onValueChange={value => {
                form.setValue('gender', value);
                form.touchField('gender');
              }}
            >
              <SelectTrigger
                {...form.getFieldProps('gender')}
                onBlur={() => form.touchField('gender')}
              >
                <SelectValue placeholder="Choose gender" />
              </SelectTrigger>
              <SelectContent className="bg-popover/95 backdrop-blur-xl border border-border/30 rounded-xl shadow-2xl">
                <SelectItem value="Male" className="rounded-lg transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span>Male &#9794;</span>
                  </div>
                </SelectItem>
                <SelectItem value="Female" className="rounded-lg transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                    <span>Female &#9792;</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Date of Birth"
            fieldId="dateOfBirth"
            required
            error={form.getError('dateOfBirth')}
          >
            <Input
              id="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={e => form.setValue('dateOfBirth', e.target.value)}
              onBlur={() => form.touchField('dateOfBirth')}
              {...form.getFieldProps('dateOfBirth')}
            />
            {formData.dateOfBirth && !form.getError('dateOfBirth') && (
              <div className="text-xs text-muted-foreground/70 bg-muted/30 px-3 py-2 rounded-lg animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                Age: {calculateAge(formData.dateOfBirth)}
              </div>
            )}
          </FormField>

          <FormField
            label="Color & Markings"
            fieldId="color"
            className="md:col-span-2"
            hint="Describe the primary color and any distinctive markings"
          >
            <Input
              id="color"
              value={formData.color}
              onChange={e => form.setValue('color', e.target.value)}
              placeholder="e.g., Black & White, Red, Blue Merle"
            />
          </FormField>
        </div>

        <div
          className="my-8"
          style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}
        ></div>

        {/* Owner Selection (admin/secretary roles) */}
        {(userRole === UserRole.SECRETARY ||
          userRole === UserRole.CLUB_ADMIN ||
          userRole === UserRole.SITE_ADMIN) && (
          <FormField label="Owner" fieldId="owner" required error={form.getError('ownerId')}>
            <Select
              value={formData.ownerId}
              onValueChange={value => {
                form.setValue('ownerId', value);
                form.touchField('ownerId');
              }}
            >
              <SelectTrigger
                {...form.getFieldProps('ownerId')}
                onBlur={() => form.touchField('ownerId')}
              >
                <SelectValue placeholder="Choose dog owner">
                  {formData.ownerId
                    ? (() => {
                        const owner = people.find(p => p.id === formData.ownerId);
                        return owner ? `${owner.firstName} ${owner.lastName}` : formData.ownerId;
                      })()
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-popover/95 backdrop-blur-xl border border-border/30 rounded-xl shadow-2xl max-h-60">
                {people.map(person => (
                  <SelectItem
                    key={person.id}
                    value={person.id}
                    className="rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3 py-1">
                      <div className="p-1.5 bg-primary/10 rounded-lg">
                        <User className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">
                          {person.firstName} {person.lastName}
                        </div>
                        {person.email && (
                          <div className="text-xs text-muted-foreground/70">{person.email}</div>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}

        {/* Owner Display for Exhibitor */}
        {userRole === UserRole.EXHIBITOR && currentUserPersonId && (
          <FormField label="Owner" fieldId="owner-display">
            <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-muted/30 to-muted/10 border border-border/20 rounded-xl backdrop-blur-sm">
              <div className="p-2 bg-primary/10 rounded-xl">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-foreground">
                  {(() => {
                    const currentPerson = people.find(p => p.id === currentUserPersonId);
                    return currentPerson
                      ? `${currentPerson.firstName} ${currentPerson.lastName}`
                      : 'You';
                  })()}
                </div>
                <div className="text-xs text-muted-foreground/70 mt-0.5">
                  This dog will be registered to your account
                </div>
              </div>
              <div className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium rounded-lg">
                You
              </div>
            </div>
          </FormField>
        )}
      </CardContent>
    </Card>
  );
};
