import React, { useState, useMemo } from 'react';
import { Plus, Settings, ChevronRight, Filter, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { useShowTemplateStore } from '@/store/showTemplateStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import type { GeneratedClass } from '@/types/class-template-types';
import type { Organization, TrialType } from '@/types/show-template-types';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';

interface ShowTemplateManagerProps {
  trialId: string;
  onClassesCreated?: ((classCount: number) => void) | undefined;
}

export const ShowTemplateManager: React.FC<ShowTemplateManagerProps> = ({
  trialId,
  onClassesCreated,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | 'ALL'>('ALL');
  const [selectedTrialType, setSelectedTrialType] = useState<TrialType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewClasses, setPreviewClasses] = useState<GeneratedClass[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { getAllPresets, generateClassesFromPreset } = useShowTemplateStore();

  const { addClassesFromTemplate } = useClassStoreCompat();

  const allPresets = getAllPresets();

  // Filter presets based on selected criteria
  const filteredPresets = useMemo(() => {
    let filtered = Object.entries(allPresets);

    // Filter by organization
    if (selectedOrganization !== 'ALL') {
      filtered = filtered.filter(([, preset]) => preset.organization === selectedOrganization);
    }

    // Filter by show type
    if (selectedTrialType !== 'ALL') {
      filtered = filtered.filter(([, preset]) => preset.trialType === selectedTrialType);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        ([, preset]) =>
          preset.name.toLowerCase().includes(query) ||
          preset.trialType.toLowerCase().includes(query) ||
          preset.description?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [allPresets, selectedOrganization, selectedTrialType, searchQuery]);

  // Get unique organizations and show types for filters
  const organizations = useMemo(() => {
    const orgs = new Set(Object.values(allPresets).map(p => p.organization));
    return Array.from(orgs).sort();
  }, [allPresets]);

  const trialTypes = useMemo(() => {
    const types = new Set(Object.values(allPresets).map(p => p.trialType));
    return Array.from(types).sort();
  }, [allPresets]);

  const handlePresetSelect = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const classes = generateClassesFromPreset(presetKey);
    setPreviewClasses(classes);
  };

  const handleCreateClasses = async () => {
    if (selectedPreset) {
      try {
        const generatedClasses = generateClassesFromPreset(selectedPreset);
        const createdClasses = await addClassesFromTemplate(trialId, generatedClasses);
        onClassesCreated?.(createdClasses.length);
        setIsDialogOpen(false);
        setSelectedPreset('');
        setPreviewClasses([]);
      } catch (error) {
        logger.error('Failed to create classes from template:', 'shows', {}, error as Error);
        notifications.error('Failed to create classes from template', {
          description: getErrorMessage(error),
        });
      }
    }
  };

  const clearSelection = () => {
    setSelectedPreset('');
    setPreviewClasses([]);
  };

  const organizationIcons: Record<Organization, string> = {
    AKC: '🏆',
    UKC: '🥇',
    NACSW: '👃',
    CPE: '🎯',
    USDAA: '🚀',
    NADAC: '⚡',
    ASCA: '🐕',
    OTHER: '📋',
  };

  const trialTypeColors: Record<TrialType, string> = {
    'Scent Work': 'bg-blue-100 text-blue-800',
    Nosework: 'bg-blue-100 text-blue-800',
    'Scent Detection': 'bg-blue-100 text-blue-800',
    Agility: 'bg-teal-100 text-teal-800',
    Conformation: 'bg-violet-100 text-violet-800',
    Obedience: 'bg-orange-100 text-orange-800',
    Rally: 'bg-amber-100 text-amber-800',
    'Obedience & Rally': 'bg-orange-100 text-orange-800',
    FastCAT: 'bg-red-100 text-red-800',
    'Coursing Ability Test': 'bg-pink-100 text-pink-800',
    'Barn Hunt': 'bg-brown-100 text-brown-800',
    Tracking: 'bg-gray-100 text-gray-800',
    'Field Trial': 'bg-emerald-100 text-emerald-800',
    'Hunt Test': 'bg-teal-100 text-teal-800',
    Herding: 'bg-indigo-100 text-indigo-800',
    'Lure Coursing': 'bg-violet-100 text-violet-800',
    'Dock Diving': 'bg-cyan-100 text-cyan-800',
    'Weight Pull': 'bg-slate-100 text-slate-800',
    Other: 'bg-gray-100 text-gray-800',
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Classes from Template
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Show Template Manager</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[70vh]">
          {/* Left Panel: Template Selection */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-3">Select Show Template</h3>

              {/* Filters */}
              <div className="space-y-3 mb-4">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Organization</Label>
                    <Select
                      value={selectedOrganization}
                      onValueChange={(value: Organization | 'ALL') =>
                        setSelectedOrganization(value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Organizations</SelectItem>
                        {organizations.map(org => (
                          <SelectItem key={org} value={org}>
                            {organizationIcons[org]} {org}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Show Type</Label>
                    <Select
                      value={selectedTrialType}
                      onValueChange={(value: TrialType | 'ALL') => setSelectedTrialType(value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Show Types</SelectItem>
                        {trialTypes.map(type => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search templates..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
              </div>

              {/* Template List */}
              <ScrollArea className="h-96">
                <div className="space-y-2">
                  {filteredPresets.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Filter className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm">No templates match your criteria</p>
                    </div>
                  ) : (
                    filteredPresets.map(([key, preset]) => (
                      <Card
                        key={key}
                        className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                          selectedPreset === key ? 'border-primary bg-primary/5' : ''
                        }`}
                        onClick={() => handlePresetSelect(key)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-lg">
                                {organizationIcons[preset.organization]}
                              </span>
                              <div className="flex-1">
                                <p className="font-medium text-sm">{preset.name}</p>
                                <p className="text-xs text-gray-600">
                                  {preset.organization} • {preset.description}
                                </p>
                                <div className="flex gap-1 mt-1">
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs ${trialTypeColors[preset.trialType]}`}
                                  >
                                    {preset.trialType}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Right Panel: Preview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Preview Classes</h3>
              {previewClasses.length > 0 && (
                <Badge variant="secondary">{previewClasses.length} classes</Badge>
              )}
            </div>

            {previewClasses.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                <div className="text-center">
                  <Settings className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">Select a template to preview classes</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Template Info */}
                {selectedPreset && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{allPresets[selectedPreset].name}</h4>
                          <p className="text-sm text-gray-600">
                            {allPresets[selectedPreset].description}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            ${allPresets[selectedPreset].defaults.entryFee || 25} per class
                          </p>
                          <p className="text-xs text-gray-600">
                            Max {allPresets[selectedPreset].defaults.maxEntries || 40} entries
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Class List */}
                <ScrollArea className="h-64 border rounded-lg">
                  <div className="p-4 space-y-2">
                    {previewClasses.map((cls, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded border"
                      >
                        <div>
                          <p className="font-medium text-sm">{cls.className}</p>
                          <div className="flex gap-2 mt-1">
                            {cls.customFields &&
                              Object.entries(cls.customFields).map(([key, value]) =>
                                value ? (
                                  <Badge key={key} variant="outline" className="text-xs">
                                    {String(value)}
                                  </Badge>
                                ) : null
                              )}
                          </div>
                        </div>
                        <div className="text-right">
                          {cls.maxEntries && (
                            <p className="text-xs text-gray-600">Max: {cls.maxEntries}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <Alert>
                  <AlertDescription>
                    These classes will be added to the trial. You can modify individual classes
                    after creation.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateClasses}
                    disabled={!selectedPreset && previewClasses.length === 0}
                    className="flex-1"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create {previewClasses.length} Classes
                  </Button>
                  <Button variant="outline" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
