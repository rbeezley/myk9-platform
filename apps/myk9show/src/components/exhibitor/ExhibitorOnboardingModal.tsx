/**
 * Onboarding modal for existing users who need to complete their exhibitor profile
 * Shows when user is authenticated but doesn't have an exhibitor_profile record
 */

import React, { useState } from 'react';
import { User, Mail, Phone } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useExhibitorProfile, CreateExhibitorProfileData } from '@/hooks/useExhibitorProfile';
import { useAuthContext } from '@/hooks/useAuthContext';

interface ExhibitorOnboardingModalProps {
  open: boolean;
  onComplete?: () => void;
}

export function ExhibitorOnboardingModal({ open, onComplete }: ExhibitorOnboardingModalProps) {
  const { user } = useAuthContext();
  const { createProfileAsync, isCreatingProfile } = useExhibitorProfile();

  // Pre-fill from user metadata if available
  const userMetadata = user?.user_metadata || {};
  const [firstName, setFirstName] = useState(userMetadata.first_name || userMetadata.firstName || '');
  const [lastName, setLastName] = useState(userMetadata.last_name || userMetadata.lastName || '');
  const [phone, setPhone] = useState(userMetadata.phone || '');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name');
      return;
    }

    try {
      const data: CreateExhibitorProfileData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: user?.email || '',
        phone: phone.trim() || undefined,
      };

      await createProfileAsync(data);
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile');
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Complete Your Profile</DialogTitle>
          <DialogDescription>
            Welcome to myK9Show! Please complete your exhibitor profile to continue.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="onboard-firstName">First name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="onboard-firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First"
                  className="pl-9"
                  required
                  autoComplete="given-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboard-lastName">Last name</Label>
              <Input
                id="onboard-lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last"
                required
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="onboard-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="onboard-email"
                type="email"
                value={user?.email || ''}
                disabled
                className="pl-9 bg-muted"
              />
            </div>
            <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="onboard-phone">Phone (optional)</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="onboard-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="pl-9"
                autoComplete="tel"
              />
            </div>
          </div>

          {error && (
            <div className="text-destructive text-sm text-center">{error}</div>
          )}

          <Button type="submit" className="w-full" disabled={isCreatingProfile}>
            {isCreatingProfile ? 'Creating Profile...' : 'Complete Profile'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
