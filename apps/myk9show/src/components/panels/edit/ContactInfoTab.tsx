import React, { useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Phone, MapPin } from 'lucide-react';
import { findFieldError } from '@/lib/validation';
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

  const phoneError = findFieldError(errors, 'phone');
  const addressError = findFieldError(errors, 'address');
  const cityError = findFieldError(errors, 'city');
  const stateError = findFieldError(errors, 'state');
  const zipError = findFieldError(errors, 'zip');

  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Contact Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField label="Phone Number" fieldId="phone" error={phoneError}>
          <Input
            id="phone"
            type="tel"
            value={data.phone}
            onChange={handleInputChange('phone')}
            placeholder="Enter phone number"
            aria-invalid={!!phoneError}
            aria-describedby={phoneError ? 'phone-error' : undefined}
          />
        </FormField>

        <Separator />

        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <MapPin className="h-3 w-3" />
            Address Information
          </h4>

          <FormField
            label="Street Address"
            fieldId="address"
            error={addressError}
          >
            <Input
              id="address"
              value={data.address}
              onChange={handleInputChange('address')}
              placeholder="Enter street address"
              aria-invalid={!!addressError}
              aria-describedby={addressError ? 'address-error' : undefined}
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="City" fieldId="city" error={cityError}>
              <Input
                id="city"
                value={data.city}
                onChange={handleInputChange('city')}
                placeholder="Enter city"
                aria-invalid={!!cityError}
                aria-describedby={cityError ? 'city-error' : undefined}
              />
            </FormField>

            <FormField label="State" fieldId="state" error={stateError}>
              <Input
                id="state"
                value={data.state}
                onChange={handleInputChange('state')}
                placeholder="Enter state"
                aria-invalid={!!stateError}
                aria-describedby={stateError ? 'state-error' : undefined}
              />
            </FormField>

            <FormField label="ZIP Code" fieldId="zipCode" error={zipError}>
              <Input
                id="zipCode"
                value={data.zipCode}
                onChange={handleInputChange('zipCode')}
                placeholder="Enter ZIP code"
                aria-invalid={!!zipError}
                aria-describedby={zipError ? 'zipCode-error' : undefined}
              />
            </FormField>
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
                <FormField label="Emergency Contact Name" fieldId="emergencyContact">
                  <Input
                    id="emergencyContact"
                    value={data.emergencyContact || ''}
                    onChange={handleInputChange('emergencyContact')}
                    placeholder="Enter emergency contact name"
                  />
                </FormField>

                <FormField label="Emergency Phone" fieldId="emergencyPhone">
                  <Input
                    id="emergencyPhone"
                    type="tel"
                    value={data.emergencyPhone || ''}
                    onChange={handleInputChange('emergencyPhone')}
                    placeholder="Enter emergency phone number"
                  />
                </FormField>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
