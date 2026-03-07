import React, { useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Phone, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserFormData } from './UserEditPanel.types';

interface ContactInfoTabProps {
  data: UserFormData;
  errors: string[];
  updateData: (updates: Partial<UserFormData>) => void;
  canEditAdvancedFields: boolean;
}

export const ContactInfoTab: React.FC<ContactInfoTabProps> = ({
  data,
  errors,
  updateData,
  canEditAdvancedFields,
}) => {
  const handleInputChange = useCallback(
    (field: keyof UserFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      updateData({ [field]: e.target.value });
    },
    [updateData]
  );

  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Contact Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label
            htmlFor="phone"
            className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
          >
            Phone Number
          </Label>
          <Input
            id="phone"
            type="tel"
            value={data.phone}
            onChange={handleInputChange('phone')}
            placeholder="Enter phone number"
            className={cn(errors.some(e => e.includes('Phone')) && 'border-destructive')}
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <MapPin className="h-3 w-3" />
            Address Information
          </h4>

          <div className="space-y-2">
            <Label
              htmlFor="address"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Street Address
            </Label>
            <Input
              id="address"
              value={data.address}
              onChange={handleInputChange('address')}
              placeholder="Enter street address"
              className={cn(
                errors.some(e => e.includes('address') || e.includes('Address')) &&
                  'border-destructive'
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="city"
                className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
              >
                City
              </Label>
              <Input
                id="city"
                value={data.city}
                onChange={handleInputChange('city')}
                placeholder="Enter city"
                className={cn(errors.some(e => e.includes('City')) && 'border-destructive')}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="state"
                className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
              >
                State
              </Label>
              <Input
                id="state"
                value={data.state}
                onChange={handleInputChange('state')}
                placeholder="Enter state"
                className={cn(errors.some(e => e.includes('State')) && 'border-destructive')}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="zipCode"
                className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
              >
                ZIP Code
              </Label>
              <Input
                id="zipCode"
                value={data.zipCode}
                onChange={handleInputChange('zipCode')}
                placeholder="Enter ZIP code"
                className={cn(errors.some(e => e.includes('ZIP')) && 'border-destructive')}
              />
            </div>
          </div>
        </div>

        {canEditAdvancedFields && (
          <>
            <Separator />
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Emergency Contact
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="emergencyContact"
                    className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                  >
                    Emergency Contact Name
                  </Label>
                  <Input
                    id="emergencyContact"
                    value={data.emergencyContact || ''}
                    onChange={handleInputChange('emergencyContact')}
                    placeholder="Enter emergency contact name"
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="emergencyPhone"
                    className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                  >
                    Emergency Phone
                  </Label>
                  <Input
                    id="emergencyPhone"
                    type="tel"
                    value={data.emergencyPhone || ''}
                    onChange={handleInputChange('emergencyPhone')}
                    placeholder="Enter emergency phone number"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
