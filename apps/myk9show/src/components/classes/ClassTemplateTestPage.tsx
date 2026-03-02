import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClassTemplateManager } from './ClassTemplateManager';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useClassTemplateStore } from '@/store/classTemplateStore';
import { ClassData } from './types/classTypes';
import { logger } from '@/services/LoggingService';

export const ClassTemplateTestPage: React.FC = () => {
  const [selectedTrialId] = useState('test-trial-1');
  const { classes, getClassesByTrialId } = useClassStoreCompat();
  const { getPresets } = useClassTemplateStore();
  
  const trialClasses = getClassesByTrialId(selectedTrialId);
  const presets = getPresets();

  const handleClassesCreated = (classCount: number) => {
    logger.debug(`Successfully created ${classCount} classes!`, 'classes', {});
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 pt-20">
      <div>
        <h1 className="text-3xl font-bold mb-2">Class Template System Test</h1>
        <p className="text-gray-600">
          Test the bulk class creation system with preset templates for different organizations.
        </p>
      </div>

      {/* Template Manager */}
      <Card>
        <CardHeader>
          <CardTitle>Create Classes from Template</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Select a template to create multiple classes at once for trial: <strong>{selectedTrialId}</strong>
            </p>
            
            <ClassTemplateManager
              trialId={selectedTrialId}
              onClassesCreated={handleClassesCreated}
            />
          </div>
        </CardContent>
      </Card>

      {/* Available Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Available Presets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(presets).map(([key, preset]) => (
              <div key={key} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{preset.template.name}</h3>
                  <Badge variant="outline">{preset.template.organization}</Badge>
                </div>
                <p className="text-sm text-gray-600">{preset.template.description}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {preset.template.trialType}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {preset.generateClasses().length} classes
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Current Classes for Trial */}
      <Card>
        <CardHeader>
          <CardTitle>
            Classes for Trial: {selectedTrialId}
            <Badge variant="secondary" className="ml-2">
              {trialClasses.length} classes
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trialClasses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No classes found for this trial.</p>
              <p className="text-sm mt-1">Use the template manager above to create classes.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {trialClasses.map((cls: ClassData) => (
                <div key={cls.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <p className="font-medium">
                      {cls.element} {cls.level} {cls.section}
                    </p>
                    <p className="text-sm text-gray-600">
                      Order: {cls.classOrder} • Judge: {cls.judge} • Status: {cls.status}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline">{cls.element}</Badge>
                    <Badge variant="outline">{cls.level}</Badge>
                    {cls.section && <Badge variant="outline">Section {cls.section}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Classes Debug */}
      <Card>
        <CardHeader>
          <CardTitle>
            All Classes (Debug)
            <Badge variant="secondary" className="ml-2">
              {classes.length} total
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {classes.map((cls: ClassData) => (
              <div key={cls.id} className="text-xs p-2 bg-gray-50 rounded border">
                <strong>ID:</strong> {cls.id} | <strong>Trial:</strong> {cls.trialId} | 
                <strong> Class:</strong> {cls.element} {cls.level} {cls.section}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};