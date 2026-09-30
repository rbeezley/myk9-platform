import React from 'react';
import { MapPin, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { COUNTRIES } from '@/types/club-types';
import type { FormValidation } from '@/hooks/useFormValidation';
import type { ClubEditFormData } from './formData';

interface ClubContactCardProps {
  data: ClubEditFormData;
  form: FormValidation<ClubEditFormData> | undefined;
  handleInputChange: (
    field: keyof ClubEditFormData
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleBlur: (field: keyof ClubEditFormData) => () => void;
  handleSelectChange: (field: keyof ClubEditFormData) => (value: string) => void;
}

/** Contact tab body: the required email, phone and address fields. */
export const ClubContactCard: React.FC<ClubContactCardProps> = ({
  data,
  form,
  handleInputChange,
  handleBlur,
  handleSelectChange,
}) => (
  <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Phone className="h-5 w-5" />
        Contact Information
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Email Address" fieldId="email" required error={form?.getError('email')}>
          <Input
            id="email"
            type="email"
            value={data.email}
            onChange={handleInputChange('email')}
            onBlur={handleBlur('email')}
            placeholder="Enter email address"
            {...form?.getFieldProps('email')}
          />
        </FormField>

        <FormField label="Phone Number" fieldId="phone" required error={form?.getError('phone')}>
          <Input
            id="phone"
            type="tel"
            value={data.phone}
            onChange={handleInputChange('phone')}
            onBlur={handleBlur('phone')}
            placeholder="Enter phone number"
            {...form?.getFieldProps('phone')}
          />
        </FormField>
      </div>

      <FormField label="Website" fieldId="website" error={form?.getError('website')}>
        <Input
          id="website"
          type="url"
          value={data.website}
          onChange={handleInputChange('website')}
          onBlur={handleBlur('website')}
          placeholder="https://www.clubwebsite.com"
          {...form?.getFieldProps('website')}
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
          fieldId="street"
          required
          error={form?.getError('street')}
        >
          <Input
            id="street"
            value={data.street}
            onChange={handleInputChange('street')}
            onBlur={handleBlur('street')}
            placeholder="123 Main Street"
            {...form?.getFieldProps('street')}
          />
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="City" fieldId="city" required error={form?.getError('city')}>
            <Input
              id="city"
              value={data.city}
              onChange={handleInputChange('city')}
              onBlur={handleBlur('city')}
              placeholder="Enter city"
              {...form?.getFieldProps('city')}
            />
          </FormField>

          <FormField
            label="State/Province"
            fieldId="state"
            required
            error={form?.getError('state')}
          >
            <Input
              id="state"
              value={data.state}
              onChange={handleInputChange('state')}
              onBlur={handleBlur('state')}
              placeholder="Enter state"
              {...form?.getFieldProps('state')}
            />
          </FormField>

          <FormField label="ZIP Code" fieldId="zipCode" required error={form?.getError('zipCode')}>
            <Input
              id="zipCode"
              value={data.zipCode}
              onChange={handleInputChange('zipCode')}
              onBlur={handleBlur('zipCode')}
              placeholder="12345"
              {...form?.getFieldProps('zipCode')}
            />
          </FormField>
        </div>

        <FormField label="Country" fieldId="country" required error={form?.getError('country')}>
          <Select value={data.country} onValueChange={handleSelectChange('country')}>
            <SelectTrigger id="country" {...form?.getFieldProps('country')}>
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map(country => (
                <SelectItem key={country.value} value={country.value}>
                  {country.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
    </CardContent>
  </Card>
);
