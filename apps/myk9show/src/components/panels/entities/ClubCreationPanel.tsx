import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Mail, Phone, MapPin } from 'lucide-react';
import { useClubStore } from '@/store/clubStore';
import { notifications } from '@/lib/notifications';
import { BasePanelProps, EntityCreationResult } from '../types';
import type { Club } from '@/types/club-types';

interface ClubData {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  description: string;
}

interface ClubCreationPanelProps extends BasePanelProps {
  onStateChange?: (state: { isLoading: boolean; error: string | null; isDirty: boolean; isValid: boolean }) => void;
}

export const ClubCreationPanel: React.FC<ClubCreationPanelProps> = ({
  panelId,
  context,
  onResult,
  onStateChange,
}) => {
  const { addClub, updateClub, clubs } = useClubStore();
  
  const [formData, setFormData] = useState<ClubData>({
    name: '',
    email: '',
    phone: '',
    website: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'US',
    },
    description: '',
    ...context.preFilledData,
  });

  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize validation to prevent unnecessary recalculations
  const validationState = useMemo(() => {
    // Defensive programming: ensure clubs is a valid array
    const safeClubs = Array.isArray(clubs) ? clubs : [];
    
    const isDuplicateName = safeClubs.some(club => 
      club?.name?.toLowerCase().trim() === formData.name.toLowerCase().trim() &&
      club.id !== context.preFilledData?.id // Allow same name for edit mode
    );
    
    const isValid = formData.name.trim().length > 0 && 
                    formData.email.trim().length > 0 &&
                    formData.address.city.trim().length > 0 &&
                    formData.address.state.trim().length > 0 &&
                    !isDuplicateName;

    return { isDuplicateName, isValid };
  }, [
    formData.name,
    formData.email,
    formData.address.city,
    formData.address.state,
    clubs,
    context.preFilledData?.id
  ]);

  // Stable callback for state changes
  const handleStateChange = useCallback(() => {
    onStateChange?.({
      isLoading,
      error,
      isDirty,
      isValid: validationState.isValid,
    });
  }, [isLoading, error, isDirty, validationState.isValid, onStateChange]);

  // Update parent state
  useEffect(() => {
    handleStateChange();
  }, [handleStateChange]);

  const updateFormData = (updates: Partial<ClubData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    setIsDirty(true);
  };

  const updateAddress = (updates: Partial<ClubData['address']>) => {
    updateFormData({
      address: { ...formData.address, ...updates }
    });
  };

  const handleSave = useCallback(async (action: 'save' | 'save_and_continue' | 'save_and_close') => {
    if (!validationState.isValid) return;

    setIsLoading(true);
    setError(null);

    try {
      // Generate a unique ID for the new club
      const clubId = `club-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const clubData: Club = {
        id: clubId,
        name: formData.name.trim(),
        clubNumber: `CLUB-${Date.now()}`, // Generate a club number
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        website: formData.website.trim(),
        address: formData.address,
        description: formData.description.trim(),
        logo: '', // Default empty logo
        clubType: 'local' as const,
        memberIds: [],
        upcomingShows: [],
        pastShows: [],
        // Additional sync metadata
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: 'system',
      };

      if (context.mode === 'edit' && context.preFilledData?.id) {
        // Update existing club
        await updateClub(clubData);
      } else {
        // Create new club — await so it's in IndexedDB before selectionCallback runs
        await addClub(clubData);
      }

      // Call the selection callback if provided (may be async to refresh store)
      if (context.selectionCallback) {
        await context.selectionCallback((clubData as unknown) as Record<string, unknown>);
      }

      const result: EntityCreationResult = {
        success: true,
        entity: (clubData as unknown) as Record<string, unknown>,
        action,
      };

      notifications.success(
        context.mode === 'edit'
          ? `"${clubData.name}" updated successfully`
          : `"${clubData.name}" created successfully`
      );

      onResult(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save club';
      setError(errorMessage);
      setIsLoading(false);
      notifications.error(errorMessage);
    }
  }, [validationState.isValid, formData, context, addClub, updateClub, onResult]);

  // Override the parent component's save handler
  useEffect(() => {
    const handleParentSave = (action: 'save' | 'save_and_continue' | 'save_and_close') => {
      handleSave(action);
    };

    // Store reference for potential cleanup
    ((window as unknown) as Window & { [key: string]: unknown })[`handleSave_${panelId}`] = handleParentSave;

    return () => {
      delete ((window as unknown) as Window & { [key: string]: unknown })[`handleSave_${panelId}`];
    };
  }, [panelId, formData, validationState.isValid, handleSave]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">
            {context.mode === 'edit' ? 'Edit Club' : 'Create New Club'}
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {context.mode === 'edit' 
            ? 'Update the club information below.'
            : 'Add a new club that can host dog shows and trials.'
          }
        </p>
      </div>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
          <CardDescription>
            Essential details about the club
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Club Name *</Label>
            <Input
              id="name"
              autoComplete="organization"
              value={formData.name}
              onChange={(e) => updateFormData({ name: e.target.value })}
              placeholder="Enter club name"
              className={`w-full ${validationState.isDuplicateName ? 'border-destructive focus:border-destructive' : ''}`}
            />
            {validationState.isDuplicateName && (
              <p className="text-sm text-destructive">
                A club with this name already exists. Please choose a different name.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => updateFormData({ email: e.target.value })}
                  placeholder="club@example.com"
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={formData.phone}
                  onChange={(e) => updateFormData({ phone: e.target.value })}
                  placeholder="(555) 123-4567"
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              autoComplete="url"
              value={formData.website}
              onChange={(e) => updateFormData({ website: e.target.value })}
              placeholder="https://www.clubwebsite.com"
            />
          </div>
        </CardContent>
      </Card>

      {/* Address Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Address
          </CardTitle>
          <CardDescription>
            Club's primary location or mailing address
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="street">Street Address</Label>
            <Input
              id="street"
              autoComplete="street-address"
              value={formData.address.street}
              onChange={(e) => updateAddress({ street: e.target.value })}
              placeholder="123 Main Street"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                autoComplete="address-level2"
                value={formData.address.city}
                onChange={(e) => updateAddress({ city: e.target.value })}
                placeholder="City"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Input
                id="state"
                autoComplete="address-level1"
                value={formData.address.state}
                onChange={(e) => updateAddress({ state: e.target.value })}
                placeholder="State"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                autoComplete="postal-code"
                value={formData.address.zipCode}
                onChange={(e) => updateAddress({ zipCode: e.target.value })}
                placeholder="12345"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              autoComplete="country-name"
              value={formData.address.country}
              onChange={(e) => updateAddress({ country: e.target.value })}
              placeholder="United States"
            />
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
          <CardDescription>
            Optional details about the club
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="description">Club Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => updateFormData({ description: e.target.value })}
              placeholder="Brief description of the club, its mission, and activities..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Button
          variant="outline"
          onClick={() => handleSave('save_and_close')}
          disabled={!validationState.isValid || isLoading}
          className="flex-1"
        >
          {context.mode === 'edit' ? 'Update Club' : 'Create Club'}
        </Button>
      </div>
    </div>
  );
};