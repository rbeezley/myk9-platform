/**
 * Profile Edit Form Component
 *
 * Form for editing personal information
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UpdatePersonData } from '@/services/exhibitorService';
import type { PersonData } from './types';

interface ProfileEditFormProps {
  person: PersonData | undefined;
  onSave: (data: UpdatePersonData) => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function ProfileEditForm({ person, onSave, onCancel, isLoading }: ProfileEditFormProps) {
  const [formData, setFormData] = useState<UpdatePersonData>({
    first_name: person?.first_name || '',
    last_name: person?.last_name || '',
    phone: person?.phone || '',
    street_address: person?.street_address || '',
    city: person?.city || '',
    state: person?.state || '',
    zip_code: person?.zip_code || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="first_name">First Name</Label>
          <Input
            id="first_name"
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last Name</Label>
          <Input
            id="last_name"
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone || ''}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="street_address">Address</Label>
          <Input
            id="street_address"
            value={formData.street_address || ''}
            onChange={(e) => setFormData({ ...formData, street_address: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={formData.city || ''}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              value={formData.state || ''}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zip_code">ZIP</Label>
            <Input
              id="zip_code"
              value={formData.zip_code || ''}
              onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
            />
          </div>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
