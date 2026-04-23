import React, { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEditPanel } from './useEditPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dog, FileText, Camera, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FormField } from '@/components/common/FormField';
import type { DogFormData } from './DogEditPanel.types';
import { DogEditContext } from './DogEditPanel';
import { supabase } from '@/services/database/supabaseClient';

// ── Owner Selection Field (admin only) ──────────────────────────────

export const OwnerSelectionField: React.FC = () => {
  const { isAdmin, people: contextPeople } = useContext(DogEditContext);
  const { data, updateData } = useEditPanel<DogFormData>();

  const { data: loadedPeople = [], isLoading } = useQuery({
    queryKey: ['people', 'all'],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('people')
        .select('id, first_name, last_name, email')
        .order('last_name')
        .limit(500);
      if (error) throw error;
      return rows.map(p => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        email: p.email ?? undefined,
      }));
    },
    enabled: isAdmin,
  });

  if (!isAdmin) return null;

  // Use context people as fallback for resolving currently-selected owner display name
  // (shows immediately without waiting for the query)
  const currentOwner =
    loadedPeople.find(p => p.id === data.ownerId) ??
    contextPeople.find(p => p.id === data.ownerId);

  const displayText = currentOwner
    ? `${currentOwner.firstName} ${currentOwner.lastName}`
    : data.ownerId
      ? 'Unknown Owner'
      : 'Select owner';

  if (isLoading) {
    return (
      <div className="pt-4 border-t border-border/30">
        <FormField label="Owner" fieldId="ownerId" hint="Change the owner of this dog">
          <select
            id="ownerId"
            disabled
            value={data.ownerId || ''}
            className="w-full border-0 bg-input rounded-xl px-3.5 py-3 text-base font-medium opacity-50 cursor-not-allowed"
          >
            <option value={data.ownerId || ''}>{displayText}</option>
          </select>
          <p className="text-xs text-muted-foreground/60 mt-1">Loading people...</p>
        </FormField>
      </div>
    );
  }

  if (loadedPeople.length === 0) {
    return (
      <div className="space-y-2 pt-4 border-t border-border/30">
        <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
          Owner
        </Label>
        <div className="text-sm text-muted-foreground py-2">{displayText}</div>
        <p className="text-xs text-muted-foreground/60">No people available to assign as owner</p>
      </div>
    );
  }

  return (
    <div className="pt-4 border-t border-border/30">
      <FormField
        label={`Owner (${loadedPeople.length} available)`}
        fieldId="ownerId"
        hint="Change the owner of this dog"
      >
        <select
          id="ownerId"
          value={data.ownerId || ''}
          onChange={e => updateData({ ownerId: e.target.value })}
          className="w-full border-0 bg-input rounded-xl px-3.5 py-3 text-base font-medium transition-all duration-200 focus:bg-background focus:ring-2 focus:ring-primary/20 focus:ring-offset-1 focus:outline-none"
        >
          <option value="" disabled>
            Select owner
          </option>
          {data.ownerId && !currentOwner && (
            <option value={data.ownerId}>Unknown Owner (ID: {data.ownerId.slice(0, 8)}...)</option>
          )}
          {loadedPeople.map(person => (
            <option key={person.id} value={person.id}>
              {person.firstName} {person.lastName}
              {person.email ? ` (${person.email})` : ''}
            </option>
          ))}
        </select>
      </FormField>
    </div>
  );
};

// ── Basic Info Tab Content ───────────────────────────────────────────

interface BasicInfoTabProps {
  handleInputChange: (
    field: keyof DogFormData
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  handleSelectChange: (field: keyof DogFormData) => (value: string) => void;
  onOpenPhotoModal: () => void;
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({
  handleInputChange,
  handleSelectChange,
  onOpenPhotoModal,
}) => {
  const { data, updateData, form } = useEditPanel<DogFormData>();

  const callNameError = form?.getError('callName');
  const registeredNameError = form?.getError('registeredName');
  const genderError = form?.getError('gender');
  const dobError = form?.getError('dateOfBirth');

  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dog className="h-5 w-5" />
          Dog Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Profile Image Section */}
        <div className="flex items-center gap-4 pb-4 border-b border-border/30">
          <Avatar className="h-16 w-16">
            <AvatarImage src={data.imageUrl} alt={data.callName} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
              {data.callName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
              Dog Photo
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
              {data.imageUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateData({ imageUrl: '' })}
                  className="gap-2 text-muted-foreground hover:text-destructive"
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Call Name"
            fieldId="callName"
            required
            error={callNameError}
          >
            <Input
              id="callName"
              value={data.callName}
              onChange={handleInputChange('callName')}
              onBlur={() => form?.touchField('callName')}
              placeholder="Enter call name"
              className={cn(callNameError && 'border-destructive')}
              {...form?.getFieldProps('callName')}
            />
          </FormField>

          <FormField
            label="Registered Name"
            fieldId="registeredName"
            required
            error={registeredNameError}
          >
            <Input
              id="registeredName"
              value={data.registeredName}
              onChange={handleInputChange('registeredName')}
              onBlur={() => form?.touchField('registeredName')}
              placeholder="Enter registered name"
              className={cn(registeredNameError && 'border-destructive')}
              {...form?.getFieldProps('registeredName')}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Gender"
            fieldId="gender"
            required
            error={genderError}
          >
            <Select
              value={data.gender}
              onValueChange={v => {
                handleSelectChange('gender')(v);
                form?.touchField('gender');
              }}
            >
              <SelectTrigger
                className={cn(genderError && 'border-destructive')}
                {...form?.getFieldProps('gender')}
              >
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Date of Birth"
            fieldId="dateOfBirth"
            required
            error={dobError}
          >
            <Input
              id="dateOfBirth"
              type="date"
              value={data.dateOfBirth}
              onChange={handleInputChange('dateOfBirth')}
              onBlur={() => form?.touchField('dateOfBirth')}
              className={cn(dobError && 'border-destructive')}
              {...form?.getFieldProps('dateOfBirth')}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Color" fieldId="color">
            <Input
              id="color"
              value={data.color}
              onChange={handleInputChange('color')}
              placeholder="Enter color"
            />
          </FormField>

          <FormField label="Weight (lbs)" fieldId="weight">
            <Input
              id="weight"
              type="number"
              value={data.weight}
              onChange={handleInputChange('weight')}
              placeholder="Enter weight"
            />
          </FormField>

          <FormField label="Height (inches)" fieldId="height">
            <Input
              id="height"
              type="number"
              value={data.height}
              onChange={handleInputChange('height')}
              placeholder="Enter height"
            />
          </FormField>
        </div>

        <FormField label="Microchip Number" fieldId="microchip">
          <Input
            id="microchip"
            value={data.microchip}
            onChange={handleInputChange('microchip')}
            placeholder="Enter microchip number"
          />
        </FormField>

        <div className="flex items-center space-x-3 pt-2">
          <input
            type="checkbox"
            id="spayedNeutered"
            checked={data.spayedNeutered ?? false}
            onChange={e => updateData({ spayedNeutered: e.target.checked })}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <Label htmlFor="spayedNeutered" className="text-sm font-medium cursor-pointer">
            Spayed/Neutered
          </Label>
        </div>

        {/* Owner Selection - Only shown for admins */}
        <OwnerSelectionField />

        <Separator />

        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Additional Information
          </h4>

          <FormField label="Notes" fieldId="notes">
            <textarea
              id="notes"
              value={data.notes || ''}
              onChange={handleInputChange('notes')}
              placeholder="Enter additional notes about the dog"
              className="min-h-[80px] w-full rounded-xl border-0 bg-input px-3.5 py-2.5 text-sm font-medium tracking-tight placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background focus-visible:shadow-sm transition-all duration-200"
            />
          </FormField>

          <FormField label="Special Needs" fieldId="specialNeeds">
            <textarea
              id="specialNeeds"
              value={data.specialNeeds || ''}
              onChange={handleInputChange('specialNeeds')}
              placeholder="Enter any special needs or requirements"
              className="min-h-[60px] w-full rounded-xl border-0 bg-input px-3.5 py-2.5 text-sm font-medium tracking-tight placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background focus-visible:shadow-sm transition-all duration-200"
            />
          </FormField>
        </div>
      </CardContent>
    </Card>
  );
};

// ── Registrations Tab Content ────────────────────────────────────────

export const RegistrationsTab: React.FC = () => {
  const { data } = useEditPanel<DogFormData>();

  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Registrations
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.registrations?.length > 0 ? (
          <div className="space-y-4">
            {data.registrations.map((reg, index) => (
              <div key={index} className="border-l-4 border-primary pl-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="default">{reg.organization}</Badge>
                    <span className="font-medium">#{reg.registrationNumber}</span>
                  </div>
                  <Badge variant={reg.status === 'Active' ? 'default' : 'secondary'}>
                    {reg.status}
                  </Badge>
                </div>
                {reg.breed && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">Breed: </span>
                    {reg.breed}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Registrations</h3>
            <p className="text-sm text-muted-foreground">
              This dog has no registrations on record.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ── Health Records Tab Content ───────────────────────────────────────

export const HealthRecordsTab: React.FC = () => {
  const { data } = useEditPanel<DogFormData>();

  const hasRecords =
    (data.healthRecords?.vaccinations?.length ?? 0) > 0 ||
    (data.healthRecords?.medications?.length ?? 0) > 0 ||
    (data.healthRecords?.allergies?.length ?? 0) > 0;

  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-5 w-5" />
          Health Records
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasRecords ? (
          <div className="space-y-4">
            {data.healthRecords?.vaccinations?.map((record, index) => (
              <div key={`vax-${index}`} className="border-l-4 border-green-500 pl-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{record.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(record.date).toLocaleDateString()}
                  </span>
                </div>
                {record.nextDue && (
                  <p className="text-sm text-muted-foreground">
                    Next due: {new Date(record.nextDue).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
            {data.healthRecords?.medications?.map((record, index) => (
              <div key={`med-${index}`} className="border-l-4 border-blue-500 pl-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{record.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {record.dosage} - {record.frequency}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Started: {new Date(record.startDate).toLocaleDateString()}
                  {record.endDate && ` - Ended: ${new Date(record.endDate).toLocaleDateString()}`}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Health Records</h3>
            <p className="text-sm text-muted-foreground">This dog has no health records on file.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
