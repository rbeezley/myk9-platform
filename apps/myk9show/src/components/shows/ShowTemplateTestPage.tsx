import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShowTemplateManager } from './ShowTemplateManager';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useShowTemplateStore } from '@/store/showTemplateStore';

export const ShowTemplateTestPage: React.FC = () => {
  const [selectedTrialId] = useState('test-trial-1');
  const { getClassesByTrialId } = useClassStoreCompat();
  const { getAllPresets } = useShowTemplateStore();
  
  const trialClasses = getClassesByTrialId(selectedTrialId);
  const allPresets = getAllPresets();

  const handleClassesCreated = (classCount: number) => {
    console.log(`Successfully created ${classCount} classes!`);
  };

  // Group presets by organization
  const presetsByOrg = {
    'AKC': Object.entries(allPresets).filter(([, preset]) => preset.organization === 'AKC'),
    'UKC': Object.entries(allPresets).filter(([, preset]) => preset.organization === 'UKC'),
    'Other': Object.entries(allPresets).filter(([, preset]) => !['AKC', 'UKC'].includes(preset.organization))
  };

  const organizationIcons = {
    'AKC': '🏆',
    'UKC': '🥇',
    'NACSW': '👃',
    'CPE': '🎯',
    'USDAA': '🚀',
    'NADAC': '⚡',
    'ASCA': '🐕',
    'OTHER': '📋'
  };

  const showTypeColors = {
    'Scent Work': 'bg-blue-100 text-blue-800 border-blue-200',
    'Agility': 'bg-green-100 text-green-800 border-green-200',
    'Conformation': 'bg-purple-100 text-purple-800 border-purple-200',
    'Obedience': 'bg-orange-100 text-orange-800 border-orange-200',
    'Rally': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'FastCAT': 'bg-red-100 text-red-800 border-red-200'
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 pt-20">
      <div>
        <h1 className="text-3xl font-bold mb-2">Universal Show Template System</h1>
        <p className="text-gray-600">
          Comprehensive template system supporting multiple organizations (AKC, UKC) and show types 
          (Scent Work, Agility, Conformation, Obedience, Rally, FastCAT, etc.)
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
              Select from {Object.keys(allPresets).length} available templates to create multiple classes at once for trial: <strong>{selectedTrialId}</strong>
            </p>
            
            <ShowTemplateManager
              trialId={selectedTrialId}
              onClassesCreated={handleClassesCreated}
            />
          </div>
        </CardContent>
      </Card>

      {/* Available Templates by Organization */}
      <Card>
        <CardHeader>
          <CardTitle>Available Templates by Organization</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="AKC" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="AKC">🏆 AKC ({presetsByOrg.AKC.length})</TabsTrigger>
              <TabsTrigger value="UKC">🥇 UKC ({presetsByOrg.UKC.length})</TabsTrigger>
              <TabsTrigger value="Other">📋 Other ({presetsByOrg.Other.length})</TabsTrigger>
            </TabsList>
            
            {Object.entries(presetsByOrg).map(([orgName, presets]) => (
              <TabsContent key={orgName} value={orgName}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {presets.map(([key, preset]) => (
                    <Card key={key} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{organizationIcons[preset.organization]}</span>
                              <h3 className="font-semibold text-sm">{preset.name}</h3>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {preset.organization}
                            </Badge>
                          </div>
                          
                          <p className="text-xs text-gray-600">{preset.description}</p>
                          
                          <div className="space-y-2">
                            <Badge 
                              className={`text-xs ${showTypeColors[preset.showType as keyof typeof showTypeColors] || 'bg-gray-100 text-gray-800'}`}
                            >
                              {preset.showType}
                            </Badge>
                            
                            <div className="text-xs space-y-1">
                              <div className="flex justify-between">
                                <span>Entry Fee:</span>
                                <span className="font-medium">${preset.defaults.entryFee || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Max Entries:</span>
                                <span className="font-medium">{preset.defaults.maxEntries || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Jump Heights:</span>
                                <span className="font-medium">
                                  {preset.defaults.requiresJumpHeight ? 'Required' : 'No'}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="pt-2 border-t">
                            <p className="text-xs text-gray-500">
                              <strong>{preset.classFields.length}</strong> field{preset.classFields.length !== 1 ? 's' : ''}: {' '}
                              {preset.classFields.map(f => f.name).join(', ')}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                {presets.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p>No templates available for {orgName}</p>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
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
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {trialClasses.map((cls) => (
                  <div key={cls.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <p className="font-medium">
                        {cls.className || `${cls.element || ''} ${cls.level || ''} ${cls.section || ''}`.trim()}
                      </p>
                      <p className="text-sm text-gray-600">
                        Order: {cls.classOrder} • Judge: {cls.judge} • Status: {cls.status}
                      </p>
                      {cls.entryFee && (
                        <p className="text-sm text-green-600">Entry Fee: ${cls.entryFee}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {cls.element && <Badge variant="outline">{cls.element}</Badge>}
                      {cls.level && <Badge variant="outline">{cls.level}</Badge>}
                      {cls.section && <Badge variant="outline">Section {cls.section}</Badge>}
                      {cls.requiresJumpHeight && <Badge variant="outline">Jump Heights</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* System Overview */}
      <Card>
        <CardHeader>
          <CardTitle>System Capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-800">Organizations</h4>
              <p className="text-2xl font-bold text-blue-600">7+</p>
              <p className="text-sm text-blue-700">AKC, UKC, NACSW, CPE, USDAA, NADAC, ASCA</p>
            </div>
            
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <h4 className="font-semibold text-green-800">Show Types</h4>
              <p className="text-2xl font-bold text-green-600">15+</p>
              <p className="text-sm text-green-700">Scent Work, Agility, Conformation, Obedience, Rally, FastCAT, etc.</p>
            </div>
            
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <h4 className="font-semibold text-purple-800">Templates</h4>
              <p className="text-2xl font-bold text-purple-600">{Object.keys(allPresets).length}</p>
              <p className="text-sm text-purple-700">Ready-to-use presets</p>
            </div>
            
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <h4 className="font-semibold text-orange-800">Flexibility</h4>
              <p className="text-2xl font-bold text-orange-600">∞</p>
              <p className="text-sm text-orange-700">Custom templates & field combinations</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};