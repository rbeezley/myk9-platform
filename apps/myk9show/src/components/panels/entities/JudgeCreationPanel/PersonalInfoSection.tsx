import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { JudgeFormData } from './types';

interface PersonalInfoSectionProps {
  formData: JudgeFormData;
  errors: Record<string, string>;
  getVisibleError: (field: string) => string | undefined;
  onInputChange: (field: keyof JudgeFormData, value: unknown) => void;
}

export const PersonalInfoSection: React.FC<PersonalInfoSectionProps> = ({
  formData,
  errors,
  getVisibleError,
  onInputChange,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Basic Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              value={formData.firstName}
              onChange={(e) => onInputChange('firstName', e.target.value)}
              placeholder="Enter first name"
              className={errors.firstName ? 'border-destructive' : ''}
            />
            {getVisibleError('firstName') && (
              <p className="text-sm text-destructive">{getVisibleError('firstName')}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              value={formData.lastName}
              onChange={(e) => onInputChange('lastName', e.target.value)}
              placeholder="Enter last name"
              className={errors.lastName ? 'border-destructive' : ''}
            />
            {getVisibleError('lastName') && (
              <p className="text-sm text-destructive">{getVisibleError('lastName')}</p>
            )}
          </div>
        </div>

        {/* Judge Number */}
        <div className="space-y-2">
          <Label htmlFor="judgeNumber">Judge Number *</Label>
          <Input
            id="judgeNumber"
            value={formData.judgeNumber}
            onChange={(e) => onInputChange('judgeNumber', e.target.value)}
            placeholder="Enter official judge number"
            className={errors.judgeNumber ? 'border-destructive' : ''}
          />
          {getVisibleError('judgeNumber') && (
            <p className="text-sm text-destructive">{getVisibleError('judgeNumber')}</p>
          )}
        </div>

        {/* Contact Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => onInputChange('email', e.target.value)}
              placeholder="Enter email address"
              className={errors.email ? 'border-destructive' : ''}
            />
            {getVisibleError('email') && (
              <p className="text-sm text-destructive">{getVisibleError('email')}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone *</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => onInputChange('phone', e.target.value)}
              placeholder="Enter phone number"
              className={errors.phone ? 'border-destructive' : ''}
            />
            {getVisibleError('phone') && (
              <p className="text-sm text-destructive">{getVisibleError('phone')}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
