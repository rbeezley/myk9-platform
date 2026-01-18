/**
 * Competition Settings Component
 * Phase 6.4: User Preferences & UI State
 * 
 * Competition-specific preferences for default views, filters, and behaviors
 */

import React from 'react';
import { 
  Calendar, 
  List, 
  Grid3X3, 
  Clock, 
  Filter, 
  Eye,
  RotateCcw,
  Trophy,
  MapPin,
  Building
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import type { 
  CompetitionPreferences, 
  DefaultView, 
  SortOption, 
  RefreshInterval 
} from '@/types/user-preferences';

interface CompetitionSettingsProps {
  preferences?: CompetitionPreferences | undefined;
  onUpdate: (preferences: Partial<CompetitionPreferences>) => void;
  onReset: () => void;
}

const viewOptions: Array<{ value: DefaultView; label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = [
  { value: 'list', label: 'List View', icon: List, description: 'Detailed list with all information' },
  { value: 'grid', label: 'Grid View', icon: Grid3X3, description: 'Card-based grid layout' },
  { value: 'calendar', label: 'Calendar View', icon: Calendar, description: 'Calendar-based timeline' },
  { value: 'timeline', label: 'Timeline View', icon: Clock, description: 'Chronological timeline' },
];

const sortOptions: Array<{ value: SortOption; label: string; description: string }> = [
  { value: 'date_asc', label: 'Date (Earliest First)', description: 'Sort by date, earliest first' },
  { value: 'date_desc', label: 'Date (Latest First)', description: 'Sort by date, latest first' },
  { value: 'name_asc', label: 'Name (A-Z)', description: 'Sort alphabetically by name' },
  { value: 'name_desc', label: 'Name (Z-A)', description: 'Sort reverse alphabetically' },
  { value: 'status', label: 'Status', description: 'Group by status (open, closed, etc.)' },
];

const refreshIntervals: Array<{ value: RefreshInterval; label: string; description: string }> = [
  { value: 30, label: '30 seconds', description: 'Very frequent updates' },
  { value: 60, label: '1 minute', description: 'Frequent updates' },
  { value: 120, label: '2 minutes', description: 'Balanced updates' },
  { value: 300, label: '5 minutes', description: 'Periodic updates' },
  { value: 0, label: 'Manual only', description: 'No automatic refresh' },
];

// Sample filter options (would be loaded from the database in real implementation)
const sampleOrganizations = ['AKC', 'UKC', 'CKC', 'NADAC', 'CPE'];
const sampleDisciplines = ['Conformation', 'Agility', 'Obedience', 'Rally', 'Scent Work', 'FastCAT'];
const sampleLocations = ['California', 'New York', 'Texas', 'Florida', 'Washington'];

export function CompetitionSettings({ preferences, onUpdate, onReset }: CompetitionSettingsProps) {
  
  /**
   * Handle view change
   */
  const handleViewChange = (defaultView: DefaultView) => {
    onUpdate({ defaultView });
  };

  /**
   * Handle sort change
   */
  const handleSortChange = (defaultSort: SortOption) => {
    onUpdate({ defaultSort });
  };

  /**
   * Handle refresh interval change
   */
  const handleRefreshChange = (autoRefreshInterval: RefreshInterval) => {
    onUpdate({ autoRefreshInterval });
  };

  /**
   * Handle filter updates
   */
  const handleFilterUpdate = (
    type: 'organizations' | 'disciplines' | 'locations', 
    value: string, 
    checked: boolean
  ) => {
    if (!preferences) return;

    const currentFilters = preferences.defaultFilters[type] || [];
    const updatedFilters = checked
      ? [...currentFilters, value]
      : currentFilters.filter(item => item !== value);

    onUpdate({
      defaultFilters: {
        ...preferences.defaultFilters,
        [type]: updatedFilters,
      },
    });
  };

  /**
   * Handle boolean setting changes
   */
  const handleBooleanChange = (setting: keyof CompetitionPreferences, value: boolean) => {
    onUpdate({ [setting]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold tracking-tight mb-2">Competition Preferences</h3>
        <p className="text-sm text-muted-foreground">
          Set your default preferences for viewing and interacting with competition data
        </p>
      </div>

      {/* Default View */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Default View
          </CardTitle>
          <CardDescription>
            Choose how you prefer to view competition listings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={preferences?.defaultView || 'list'}
            onValueChange={handleViewChange}
            className="grid grid-cols-2 gap-4"
          >
            {viewOptions.map((option) => (
              <div key={option.value}>
                <RadioGroupItem
                  value={option.value}
                  id={`view-${option.value}`}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={`view-${option.value}`}
                  className="flex flex-col items-center justify-between rounded-lg border-2 border-muted p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <option.icon className="h-6 w-6 mb-2" />
                  <div className="text-center">
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {option.description}
                    </div>
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Default Sort */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <List className="h-5 w-5" />
            Default Sort Order
          </CardTitle>
          <CardDescription>
            How competitions should be sorted by default
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={preferences?.defaultSort || 'date_asc'}
            onValueChange={handleSortChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-sm text-muted-foreground">
                      {option.description}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Auto Refresh */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Auto Refresh
          </CardTitle>
          <CardDescription>
            How often to automatically refresh competition data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Select
              value={preferences?.autoRefreshInterval?.toString() || '60'}
              onValueChange={(value) => handleRefreshChange(parseInt(value) as RefreshInterval)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {refreshIntervals.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-medium">Enable Live Updates</Label>
                <div className="text-sm text-muted-foreground">
                  Receive real-time updates during active competitions
                </div>
              </div>
              <Switch
                checked={preferences?.enableLiveUpdates ?? true}
                onCheckedChange={(checked) => handleBooleanChange('enableLiveUpdates', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Display Options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Display Options
          </CardTitle>
          <CardDescription>
            Control what information is shown in competition listings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-medium">Show Past Events</Label>
              <div className="text-sm text-muted-foreground">
                Include completed competitions in listings
              </div>
            </div>
            <Switch
              checked={preferences?.showPastEvents ?? false}
              onCheckedChange={(checked) => handleBooleanChange('showPastEvents', checked)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-medium">Show Notifications</Label>
              <div className="text-sm text-muted-foreground">
                Display notification badges for updates and deadlines
              </div>
            </div>
            <Switch
              checked={preferences?.showNotifications ?? true}
              onCheckedChange={(checked) => handleBooleanChange('showNotifications', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Default Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Default Filters
          </CardTitle>
          <CardDescription>
            Pre-select filters that will be applied by default
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Organizations */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Building className="h-4 w-4" />
              <Label className="font-medium">Organizations</Label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {sampleOrganizations.map((org) => (
                <div key={org} className="flex items-center space-x-2">
                  <Checkbox
                    id={`org-${org}`}
                    checked={preferences?.defaultFilters.organizations?.includes(org) || false}
                    onCheckedChange={(checked) => 
                      handleFilterUpdate('organizations', org, checked as boolean)
                    }
                  />
                  <Label htmlFor={`org-${org}`} className="text-sm">
                    {org}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Disciplines */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-4 w-4" />
              <Label className="font-medium">Disciplines</Label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {sampleDisciplines.map((discipline) => (
                <div key={discipline} className="flex items-center space-x-2">
                  <Checkbox
                    id={`disc-${discipline}`}
                    checked={preferences?.defaultFilters.disciplines?.includes(discipline) || false}
                    onCheckedChange={(checked) => 
                      handleFilterUpdate('disciplines', discipline, checked as boolean)
                    }
                  />
                  <Label htmlFor={`disc-${discipline}`} className="text-sm">
                    {discipline}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Locations */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4" />
              <Label className="font-medium">Locations</Label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {sampleLocations.map((location) => (
                <div key={location} className="flex items-center space-x-2">
                  <Checkbox
                    id={`loc-${location}`}
                    checked={preferences?.defaultFilters.locations?.includes(location) || false}
                    onCheckedChange={(checked) => 
                      handleFilterUpdate('locations', location, checked as boolean)
                    }
                  />
                  <Label htmlFor={`loc-${location}`} className="text-sm">
                    {location}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Current Settings Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="font-medium">Default View:</Label>
              <div className="text-muted-foreground">
                {viewOptions.find(v => v.value === preferences?.defaultView)?.label || 'List View'}
              </div>
            </div>
            <div>
              <Label className="font-medium">Default Sort:</Label>
              <div className="text-muted-foreground">
                {sortOptions.find(s => s.value === preferences?.defaultSort)?.label || 'Date (Earliest First)'}
              </div>
            </div>
            <div>
              <Label className="font-medium">Auto Refresh:</Label>
              <div className="text-muted-foreground">
                {refreshIntervals.find(r => r.value === preferences?.autoRefreshInterval)?.label || '1 minute'}
              </div>
            </div>
            <div>
              <Label className="font-medium">Active Filters:</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {preferences?.defaultFilters.organizations?.map(org => (
                  <Badge key={org} variant="secondary" className="text-xs">{org}</Badge>
                ))}
                {preferences?.defaultFilters.disciplines?.map(disc => (
                  <Badge key={disc} variant="secondary" className="text-xs">{disc}</Badge>
                ))}
                {preferences?.defaultFilters.locations?.map(loc => (
                  <Badge key={loc} variant="secondary" className="text-xs">{loc}</Badge>
                ))}
                {(!preferences?.defaultFilters.organizations?.length && 
                  !preferences?.defaultFilters.disciplines?.length && 
                  !preferences?.defaultFilters.locations?.length) && (
                  <span className="text-muted-foreground text-xs">None</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reset Button */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={onReset} className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Competition Settings
        </Button>
      </div>
    </div>
  );
}