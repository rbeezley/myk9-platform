import { Zap, ChevronRight, Settings, Plus } from "lucide-react";
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useClassTemplateStore } from '@/store/classTemplateStore';
import { GeneratedClass } from '@/types/class-template-types';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';

interface ClassTemplateManagerProps {
  trialId: string;
  onClassesCreated?: (classCount: number) => void;
}

export const ClassTemplateManager: React.FC<ClassTemplateManagerProps> = ({
  trialId,
  onClassesCreated
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [previewClasses, setPreviewClasses] = useState<GeneratedClass[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const {
    templates,
    getPresets,
    generateClassesFromPreset,
    generateClassesFromTemplate,
    createClassesFromPreset,
  } = useClassTemplateStore();
  
  const presets = getPresets();

  const handlePresetSelect = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const classes = generateClassesFromPreset(presetKey);
    setPreviewClasses(classes);
  };

  const handleTemplateSelect = (templateId: string) => {
    const classes = generateClassesFromTemplate(templateId);
    setPreviewClasses(classes);
  };

  const handleCreateClasses = async () => {
    if (selectedPreset) {
      try {
        const createdClasses = await createClassesFromPreset(selectedPreset, trialId);
        onClassesCreated?.(createdClasses.length);
        setIsDialogOpen(false);
        setSelectedPreset('');
        setPreviewClasses([]);
      } catch (error) {
        logger.error('Failed to create classes from preset:', 'classes', {}, error as Error);
        notifications.error('Failed to create classes from preset', {
          description: getErrorMessage(error),
        });
      }
    }
  };

  const organizationIcons = {
    'AKC': '🏆',
    'UKC': '🥇',
    'NACSW': '👃',
    'CPE': '🎯',
    'USDAA': '🚀',
    'NADAC': '⚡',
    'OTHER': '📋'
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Zap className="h-4 w-4" />
          Add Classes from Template
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Class Template Manager</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[60vh]">
          {/* Left Panel: Template Selection */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-3">Select Template</h3>
              
              {/* Preset Templates */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700">Preset Templates</h4>
                <div className="space-y-2">
                  {Object.entries(presets).map(([key, preset]) => (
                    <Card
                      key={key}
                      className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                        selectedPreset === key ? 'border-primary bg-primary/5' : ''
                      }`}
                      onClick={() => handlePresetSelect(key)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              {organizationIcons[preset.template.organization]}
                            </span>
                            <div>
                              <p className="font-medium text-sm">{preset.template.name}</p>
                              <p className="text-xs text-gray-600">
                                {preset.template.organization} • {preset.template.showType}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
              
              {/* Custom Templates */}
              {templates.length > 0 && (
                <div className="space-y-3 mt-6">
                  <h4 className="text-sm font-medium text-gray-700">Custom Templates</h4>
                  <div className="space-y-2">
                    {templates.map(template => (
                      <Card
                        key={template.id}
                        className="cursor-pointer transition-colors hover:bg-gray-50"
                        onClick={() => handleTemplateSelect(template.id)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {organizationIcons[template.organization]}
                              </span>
                              <div>
                                <p className="font-medium text-sm">{template.name}</p>
                                <p className="text-xs text-gray-600">
                                  {template.organization} • {template.showType}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">Custom</Badge>
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Right Panel: Preview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Preview Classes</h3>
              {previewClasses.length > 0 && (
                <Badge variant="secondary">
                  {previewClasses.length} classes
                </Badge>
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
                <ScrollArea className="h-80 border rounded-lg">
                  <div className="p-4 space-y-2">
                    {previewClasses.map((cls, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded border"
                      >
                        <div>
                          <p className="font-medium text-sm">{cls.className}</p>
                          <div className="flex gap-2 mt-1">
                            {cls.element && (
                              <Badge variant="outline" className="text-xs">{cls.element}</Badge>
                            )}
                            {cls.level && (
                              <Badge variant="outline" className="text-xs">{cls.level}</Badge>
                            )}
                            {cls.section && (
                              <Badge variant="outline" className="text-xs">Section {cls.section}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {cls.entryFee && (
                            <p className="text-sm font-medium">${cls.entryFee}</p>
                          )}
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
                    These classes will be added to the trial. You can modify individual classes after creation.
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
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedPreset('');
                      setPreviewClasses([]);
                    }}
                  >
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