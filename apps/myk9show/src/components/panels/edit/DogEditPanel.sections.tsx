import React, { useContext } from 'react';
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
import type { DogFormData } from './DogEditPanel.types';
import { DogEditContext } from './DogEditPanel';

// ── Owner Selection Field (admin only) ──────────────────────────────

export const OwnerSelectionField: React.FC = () => {
  const { isAdmin, people } = useContext(DogEditContext);
  const { data, updateData } = useEditPanel<DogFormData>();

  if (!isAdmin) return null;

  const currentOwner = people.find(p => p.id === data.ownerId);

  const displayText = currentOwner
    ? `${currentOwner.firstName} ${currentOwner.lastName}`
    : data.ownerId
      ? 'Unknown Owner'
      : 'Select owner';

  if (people.length === 0) {
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
    <div className="space-y-2 pt-4 border-t border-border/30">
      <Label
        htmlFor="ownerId"
        className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
      >
        Owner ({people.length} available)
      </Label>
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
        {people.map(person => (
          <option key={person.id} value={person.id}>
            {person.firstName} {person.lastName}
            {person.email ? ` (${person.email})` : ''}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground/60">Change the owner of this dog (admin only)</p>
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
  const { data, updateData, errors } = useEditPanel<DogFormData>();

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
          <div className="space-y-2">
            <Label
              htmlFor="callName"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Call Name *
            </Label>
            <Input
              id="callName"
              value={data.callName}
              onChange={handleInputChange('callName')}
              placeholder="Enter call name"
              className={cn(errors.some(e => e.includes('Call name')) && 'border-destructive')}
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="registeredName"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Registered Name *
            </Label>
            <Input
              id="registeredName"
              value={data.registeredName}
              onChange={handleInputChange('registeredName')}
              placeholder="Enter registered name"
              className={cn(
                errors.some(e => e.includes('Registered name')) && 'border-destructive'
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label
              htmlFor="gender"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Gender *
            </Label>
            <Select value={data.gender} onValueChange={handleSelectChange('gender')}>
              <SelectTrigger
                className={cn(errors.some(e => e.includes('Gender')) && 'border-destructive')}
              >
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="dateOfBirth"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Date of Birth *
            </Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={data.dateOfBirth}
              onChange={handleInputChange('dateOfBirth')}
              className={cn(errors.some(e => e.includes('Date of birth')) && 'border-destructive')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label
              htmlFor="color"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Color
            </Label>
            <Input
              id="color"
              value={data.color}
              onChange={handleInputChange('color')}
              placeholder="Enter color"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="weight"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Weight (lbs)
            </Label>
            <Input
              id="weight"
              type="number"
              value={data.weight}
              onChange={handleInputChange('weight')}
              placeholder="Enter weight"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="height"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Height (inches)
            </Label>
            <Input
              id="height"
              type="number"
              value={data.height}
              onChange={handleInputChange('height')}
              placeholder="Enter height"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="microchip"
            className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
          >
            Microchip Number
          </Label>
          <Input
            id="microchip"
            value={data.microchip}
            onChange={handleInputChange('microchip')}
            placeholder="Enter microchip number"
          />
        </div>

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

          <div className="space-y-2">
            <Label
              htmlFor="notes"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Notes
            </Label>
            <textarea
              id="notes"
              value={data.notes || ''}
              onChange={handleInputChange('notes')}
              placeholder="Enter additional notes about the dog"
              className="min-h-[80px] w-full rounded-xl border-0 bg-input px-3.5 py-2.5 text-sm font-medium tracking-tight placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background focus-visible:shadow-sm transition-all duration-200"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="specialNeeds"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Special Needs
            </Label>
            <textarea
              id="specialNeeds"
              value={data.specialNeeds || ''}
              onChange={handleInputChange('specialNeeds')}
              placeholder="Enter any special needs or requirements"
              className="min-h-[60px] w-full rounded-xl border-0 bg-input px-3.5 py-2.5 text-sm font-medium tracking-tight placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background focus-visible:shadow-sm transition-all duration-200"
            />
          </div>
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
