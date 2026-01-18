/**
 * Onboarding modal for existing users who need to complete their exhibitor profile
 * Shows when user is authenticated but doesn't have an exhibitor_profile record
 */

import React, { useState } from 'react';
import { User, Mail, Phone, X } from 'lucide-react';
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
  onSkip?: () => void;
}

export function ExhibitorOnboardingModal({ open, onComplete, onSkip }: ExhibitorOnboardingModalProps) {
  const { user } = useAuthContext();
  const { createProfileAsync, isCreatingProfile } = useExhibitorProfile();

  // Pre-fill from user metadata if available
  const userMetadata = user?.user_metadata || {};
  const [firstName, setFirstName] = useState(userMetadata.first_name || userMetadata.firstName || '');
  const [lastName, setLastName] = useState(userMetadata.last_name || userMetadata.lastName || '');
  const [phone, setPhone] = useState(userMetadata.phone || '');
  const [error, setError] = useState('');
  const [hasAttempted, setHasAttempted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setHasAttempted(true);

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

  const handleClose = () => {
    if (hasAttempted && error) {
      onSkip?.();
    }
  };

  // Allow closing only after a failed attempt
  const canClose = hasAttempted && error;

  return (
    <Dialog open={open} onOpenChange={canClose ? handleClose : () => {}}>

      <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
        {canClose && (
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg">Complete Your Profile</DialogTitle>
          <DialogDescription className="text-sm">
            Please complete your exhibitor profile to continue.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="onboard-firstName" className="text-xs">First name</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="onboard-firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First"
                  className="pl-8 h-9 text-sm"
                  required
                  autoComplete="given-name"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="onboard-lastName" className="text-xs">Last name</Label>
              <Input
                id="onboard-lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last"
                className="h-9 text-sm"
                required
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="onboard-email" className="text-xs">Email</Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="onboard-email"
                type="email"
                value={user?.email || ''}
                disabled
                className="pl-8 h-9 text-sm bg-muted"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="onboard-phone" className="text-xs">Phone (optional)</Label>
            <div className="relative">
              <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="onboard-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="pl-8 h-9 text-sm"
                autoComplete="tel"
              />
            </div>
          </div>

          {error && (
            <div className="text-destructive text-sm text-center p-2 bg-destructive/10 rounded-md">{error}</div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button type="submit" className="w-full h-9" disabled={isCreatingProfile}>
              {isCreatingProfile ? 'Creating Profile...' : 'Complete Profile'}
            </Button>
            {canClose && (
              <Button type="button" variant="ghost" className="w-full h-9 text-sm" onClick={handleClose}>
                Skip for now
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
