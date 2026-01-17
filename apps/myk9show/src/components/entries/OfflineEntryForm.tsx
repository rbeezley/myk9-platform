import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/services/LoggingService';
import {
  CloudOff, 
  Wifi, 
  WifiOff,
  Save, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  User,
  DollarSign,
  FileText,
  Upload,
  RefreshCw
} from 'lucide-react';
import { useEntryStoreCompat } from '@/hooks/useEntryStoreCompat';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStoreCompat } from '@/hooks/useShowStoreCompat';
import type { ShowEntryInput, RegistrationData } from '@/store/entryStore';

interface NetworkStatus {
  isOnline: boolean;
  quality: 'offline' | 'poor' | 'good' | 'excellent';
}

interface OfflineEntryFormProps {
  /** Pre-filled show ID */
  showId?: string;
  /** Pre-filled class ID */
  classId?: string;
  /** Pre-filled dog ID */
  dogId?: string;
  /** Whether this is editing an existing entry */
  editingEntryId?: string;
  /** Callback when entry is saved */
  onSave?: (entryId: string) => void;
  /** Callback when form is cancelled */
  onCancel?: () => void;
  /** Custom className */
  className?: string;
}

/**
 * OfflineEntryForm - Optimized entry creation form for offline use with Apple-inspired design
 * 
 * Provides robust offline functionality with local storage, validation, and queue management.
 * Automatically syncs when network becomes available and provides clear offline indicators.
 */
export const OfflineEntryForm: React.FC<OfflineEntryFormProps> = ({
  showId: initialShowId,
  classId: initialClassId,
  dogId: initialDogId,
  editingEntryId,
  onSave,
  onCancel,
  className = ''
}) => {
  // Network status simulation (in real app, this would come from a network monitor)
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    quality: navigator.onLine ? 'good' : 'offline'
  });

  // Form state
  const [formData, setFormData] = useState<ShowEntryInput>({
    showId: initialShowId || '',
    classId: initialClassId || '',
    dogId: initialDogId || '',
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: '',
      handlerId: '',
      entryFee: 0,
      paymentStatus: 'pending',
      specialRequests: '',
      jumpHeight: '',
      preferredJudge: '',
      moveUpRequested: false
    }
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Store hooks
  const { createEntry, updateEntry, getEntry } = useEntryStoreCompat();
  const { dogs } = useDogStoreCompat();
  const { shows } = useShowStoreCompat();

  // Load existing entry for editing
  useEffect(() => {
    if (editingEntryId) {
      const existingEntry = getEntry(editingEntryId);
      if (existingEntry) {
        setFormData({
          showId: existingEntry.showId,
          classId: existingEntry.classId,
          dogId: existingEntry.dogId,
          registrationData: existingEntry.registrationData
        });
      }
    }
  }, [editingEntryId, getEntry]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setNetworkStatus(prev => ({ ...prev, isOnline: true, quality: 'good' }));
    };

    const handleOffline = () => {
      setNetworkStatus({ isOnline: false, quality: 'offline' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-save functionality for offline resilience
  useEffect(() => {
    if (hasUnsavedChanges) {
      const autoSaveTimer = setTimeout(() => {
        // Auto-save to local storage every 30 seconds
        localStorage.setItem(`entry-draft-${editingEntryId || 'new'}`, JSON.stringify(formData));
      }, 30000);

      return () => clearTimeout(autoSaveTimer);
    }
    return undefined;
  }, [formData, hasUnsavedChanges, editingEntryId]);

  // Load draft from local storage on mount
  useEffect(() => {
    const draftKey = `entry-draft-${editingEntryId || 'new'}`;
    const savedDraft = localStorage.getItem(draftKey);
    
    if (savedDraft && !editingEntryId) {
      try {
        const parsedDraft = JSON.parse(savedDraft);
        setFormData(parsedDraft);
        setHasUnsavedChanges(true);
      } catch (error) {
        logger.warn('Failed to load entry draft from localStorage:', 'entries', {}, error as Error);
      }
    }
  }, [editingEntryId]);

  // Available dogs, shows, and classes
  const availableDogs = useMemo(() => {
    return dogs.map(dog => ({
      id: dog.id,
      name: dog.callName || dog.name,
      breed: dog.breed
    }));
  }, [dogs]);

  const availableShows = useMemo(() => {
    return shows.map(show => ({
      id: show.id,
      name: show.name,
      date: show.startDate
    }));
  }, [shows]);

  // Form validation
  const isFormValid = useMemo(() => {
    return (
      formData.showId &&
      formData.classId &&
      formData.dogId &&
      formData.registrationData.handler &&
      formData.registrationData.entryFee > 0
    );
  }, [formData]);

  // Handle form field changes
  const updateFormField = (field: keyof ShowEntryInput, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
    setSaveError(null);
  };

  const updateRegistrationField = (field: keyof RegistrationData, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      registrationData: { ...prev.registrationData, [field]: value }
    }));
    setHasUnsavedChanges(true);
    setSaveError(null);
  };

  // Handle form submission
  const handleSave = async () => {
    if (!isFormValid) {
      setSaveError('Please fill in all required fields');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      let entryId: string;

      if (editingEntryId) {
        const updatedEntry = await updateEntry(editingEntryId, formData);
        entryId = updatedEntry?.id || editingEntryId;
      } else {
        const newEntry = await createEntry(formData);
        entryId = newEntry.id;
      }

      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      
      // Clear draft from localStorage
      localStorage.removeItem(`entry-draft-${editingEntryId || 'new'}`);
      
      onSave?.(entryId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save entry';
      setSaveError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Network status indicator
  const NetworkIndicator = () => (
    <div className="flex items-center gap-2">
      {networkStatus.isOnline ? (
        <>
          <Wifi className="h-4 w-4 text-green-600" />
          <span className="text-xs text-green-600">Online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4 text-orange-600" />
          <span className="text-xs text-orange-600">Offline</span>
        </>
      )}
    </div>
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with network status */}
      <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm 
                      border border-border/50 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {editingEntryId ? 'Edit Entry' : 'New Entry'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {networkStatus.isOnline ? 'Auto-sync enabled' : 'Working offline - will sync when reconnected'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <NetworkIndicator />
          {hasUnsavedChanges && (
            <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
              <Clock className="h-3 w-3 mr-1" />
              Unsaved
            </Badge>
          )}
          {lastSaved && (
            <Badge variant="default" className="bg-green-50 text-green-700 border-green-200">
              <CheckCircle className="h-3 w-3 mr-1" />
              Saved {lastSaved.toLocaleTimeString()}
            </Badge>
          )}
        </div>
      </div>

      {/* Offline alert */}
      {!networkStatus.isOnline && (
        <Alert className="bg-orange-50 border-orange-200">
          <CloudOff className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            You're working offline. Your entry will be saved locally and synced automatically when you reconnect.
          </AlertDescription>
        </Alert>
      )}

      {/* Error alert */}
      {saveError && (
        <Alert className="bg-red-50 border-red-200">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {saveError}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entry Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Entry Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Show Selection */}
            <div className="space-y-2">
              <Label htmlFor="showId" className="text-sm font-medium">
                Show *
              </Label>
              <Select
                value={formData.showId}
                onValueChange={(value) => updateFormField('showId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a show" />
                </SelectTrigger>
                <SelectContent>
                  {availableShows.map((show) => (
                    <SelectItem key={show.id} value={show.id}>
                      {show.name} - {new Date(show.date).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Class Selection */}
            <div className="space-y-2">
              <Label htmlFor="classId" className="text-sm font-medium">
                Class *
              </Label>
              <Input
                id="classId"
                value={formData.classId}
                onChange={(e) => updateFormField('classId', e.target.value)}
                placeholder="Enter class ID or name"
              />
            </div>

            {/* Dog Selection */}
            <div className="space-y-2">
              <Label htmlFor="dogId" className="text-sm font-medium">
                Dog *
              </Label>
              <Select
                value={formData.dogId}
                onValueChange={(value) => updateFormField('dogId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a dog" />
                </SelectTrigger>
                <SelectContent>
                  {availableDogs.map((dog) => (
                    <SelectItem key={dog.id} value={dog.id}>
                      {dog.name} ({dog.breed})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Registration Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Registration Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Handler */}
            <div className="space-y-2">
              <Label htmlFor="handler" className="text-sm font-medium">
                Handler *
              </Label>
              <Input
                id="handler"
                value={formData.registrationData.handler}
                onChange={(e) => updateRegistrationField('handler', e.target.value)}
                placeholder="Handler name"
              />
            </div>

            {/* Entry Fee */}
            <div className="space-y-2">
              <Label htmlFor="entryFee" className="text-sm font-medium">
                Entry Fee *
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="entryFee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.registrationData.entryFee}
                  onChange={(e) => updateRegistrationField('entryFee', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="pl-10"
                />
              </div>
            </div>

            {/* Jump Height */}
            <div className="space-y-2">
              <Label htmlFor="jumpHeight" className="text-sm font-medium">
                Jump Height
              </Label>
              <Select
                value={formData.registrationData.jumpHeight || ''}
                onValueChange={(value) => updateRegistrationField('jumpHeight', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select jump height" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">8 inches</SelectItem>
                  <SelectItem value="12">12 inches</SelectItem>
                  <SelectItem value="16">16 inches</SelectItem>
                  <SelectItem value="20">20 inches</SelectItem>
                  <SelectItem value="24">24 inches</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Preferred Judge */}
            <div className="space-y-2">
              <Label htmlFor="preferredJudge" className="text-sm font-medium">
                Preferred Judge
              </Label>
              <Input
                id="preferredJudge"
                value={formData.registrationData.preferredJudge || ''}
                onChange={(e) => updateRegistrationField('preferredJudge', e.target.value)}
                placeholder="Judge name (if preference allowed)"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Special Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Special Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.registrationData.specialRequests || ''}
            onChange={(e) => updateRegistrationField('specialRequests', e.target.value)}
            placeholder="Any special handling requests or notes..."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm 
                      border border-border/50 rounded-xl">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {networkStatus.isOnline ? (
            <>
              <Upload className="h-4 w-4 text-green-600" />
              <span>Changes will sync automatically</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4 text-orange-600" />
              <span>Changes saved locally</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
          )}
          
          <Button
            onClick={handleSave}
            disabled={!isFormValid || isSaving}
            className="min-w-[120px]"
          >
            {isSaving ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {editingEntryId ? 'Update Entry' : 'Save Entry'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OfflineEntryForm;