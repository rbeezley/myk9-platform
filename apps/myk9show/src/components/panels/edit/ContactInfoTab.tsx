import React from 'react';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Phone, MapPin } from 'lucide-react';
import { useEditPanel } from './useEditPanel';
import type { UserFormData } from './UserEditPanel.types';

interface ContactInfoTabProps {
  canEditAdvancedFields: boolean;
}

export const ContactInfoTab: React.FC<ContactInfoTabProps> = ({ canEditAdvancedFields }) => {
  const { data, form } = useEditPanel<UserFormData>();

  const phoneError = form?.getError('phone');
  const cityError = form?.getError('city');
  const stateError = form?.getError('state');

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
            onChange={e => form?.setValue('phone', e.target.value)}
            onBlur={() => form?.touchField('phone')}
            placeholder="Enter phone number"
            {...form?.getFieldProps('phone')}
          />
        </FormField>

        <Separator />

        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <MapPin className="h-3 w-3" />
            Address Information
          </h4>

          <FormField label="Street Address" fieldId="address">
            <Input
              id="address"
              value={data.address}
              onChange={e => form?.setValue('address', e.target.value)}
              onBlur={() => form?.touchField('address')}
              placeholder="Enter street address"
              {...form?.getFieldProps('address')}
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="City" fieldId="city" error={cityError}>
              <Input
                id="city"
                value={data.city}
                onChange={e => form?.setValue('city', e.target.value)}
                onBlur={() => form?.touchField('city')}
                placeholder="Enter city"
                {...form?.getFieldProps('city')}
              />
            </FormField>

            <FormField label="State" fieldId="state" error={stateError}>
              <Input
                id="state"
                value={data.state}
                onChange={e => form?.setValue('state', e.target.value)}
                onBlur={() => form?.touchField('state')}
                placeholder="Enter state"
                {...form?.getFieldProps('state')}
              />
            </FormField>

            <FormField label="ZIP Code" fieldId="zipCode">
              <Input
                id="zipCode"
                value={data.zipCode}
                onChange={e => form?.setValue('zipCode', e.target.value)}
                onBlur={() => form?.touchField('zipCode')}
                placeholder="Enter ZIP code"
                {...form?.getFieldProps('zipCode')}
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
                    onChange={e => form?.setValue('emergencyContact', e.target.value)}
                    onBlur={() => form?.touchField('emergencyContact')}
                    placeholder="Enter emergency contact name"
                  />
                </FormField>

                <FormField label="Emergency Phone" fieldId="emergencyPhone">
                  <Input
                    id="emergencyPhone"
                    type="tel"
                    value={data.emergencyPhone || ''}
                    onChange={e => form?.setValue('emergencyPhone', e.target.value)}
                    onBlur={() => form?.touchField('emergencyPhone')}
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
