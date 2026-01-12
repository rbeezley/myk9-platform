import React, { useState } from 'react';
import { logger } from '@/services/LoggingService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Lightbulb,
  Play,
  RefreshCw,
  Shuffle,
  Zap,
} from 'lucide-react';
import { ConflictResolutionManager } from './ConflictResolutionManager';
import { SyncConflictResolver } from '@/services/sync/SyncConflictResolver';
import { EventEmitter } from '@/services/sync/eventEmitter';
import { 
  Conflict, 
  EnhancedConflictResolution, 
  ResolutionStrategy 
} from '@/types/sync-types';
import {
  ConflictPriority,
  ConflictType
} from '@/types/conflict-types';
import type { SyncEventMap } from '@/services/sync/types';

export const ConflictResolutionDemo: React.FC = () => {
  const [demoConflicts, setDemoConflicts] = useState<Conflict[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [conflictResolver] = useState(() => {
    const eventEmitter = new EventEmitter<SyncEventMap>();
    return new SyncConflictResolver(eventEmitter);
  });

  // Generate sample conflicts for demonstration
  const generateSampleConflicts = () => {
    setIsGenerating(true);
    
    setTimeout(() => {
      const sampleConflicts: Conflict[] = [
        {
          id: 'conflict-1',
          entityType: 'show',
          entityId: 'show-123',
          entityName: 'Westminster Dog Show 2024',
          status: 'pending',
          localData: {
            name: 'Westminster Dog Show 2024',
            date: '2024-02-10',
            location: 'Madison Square Garden',
            status: 'published',
            entryDeadline: '2024-01-15',
            judgingStart: '09:00',
            maxEntries: 500,
          },
          remoteData: {
            name: 'Westminster Dog Show 2024',
            date: '2024-02-11', // Different date
            location: 'Madison Square Garden',
            status: 'published',
            entryDeadline: '2024-01-20', // Extended deadline
            judgingStart: '08:30', // Earlier start
            maxEntries: 600, // Increased capacity
          },
          serverData: {
            name: 'Westminster Dog Show 2024',
            date: '2024-02-11', // Different date
            location: 'Madison Square Garden',
            status: 'published',
            entryDeadline: '2024-01-20', // Extended deadline
            judgingStart: '08:30', // Earlier start
            maxEntries: 600, // Increased capacity
          },
          fieldPath: 'show.schedule',
          priority: 'high' as ConflictPriority,
          conflictFields: ['date', 'entryDeadline', 'judgingStart', 'maxEntries'],
          conflictType: 'concurrent_edit' as ConflictType,
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          lastModified: {
            local: new Date(Date.now() - 1 * 60 * 60 * 1000),
            remote: new Date(Date.now() - 30 * 60 * 1000),
          },
          lastModifiedBy: {
            local: 'secretary@westminster.com',
            remote: 'admin@akc.org',
          },
          metadata: {
            autoResolvable: false,
            affectedUsers: ['secretary@westminster.com', 'admin@akc.org', 'judge@akc.org'],
            deadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
          },
        },
        {
          id: 'conflict-2',
          entityType: 'entry',
          entityId: 'entry-456',
          entityName: 'Golden Retriever - Rex',
          status: 'pending',
          localData: {
            dogName: 'Rex',
            breed: 'Golden Retriever',
            class: 'Open Dogs',
            armband: '42',
            exhibitor: 'John Smith',
            entryStatus: 'confirmed',
            fees: 35.00,
          },
          remoteData: {
            dogName: 'Rex',
            breed: 'Golden Retriever',
            class: 'Champion Dogs', // Moved to different class
            armband: '42',
            exhibitor: 'John Smith',
            entryStatus: 'confirmed',
            fees: 50.00, // Different fee structure
          },
          serverData: {
            dogName: 'Rex',
            breed: 'Golden Retriever',
            class: 'Champion Dogs', // Moved to different class
            armband: '42',
            exhibitor: 'John Smith',
            entryStatus: 'confirmed',
            fees: 50.00, // Different fee structure
          },
          priority: 'medium' as ConflictPriority,
          conflictFields: ['class', 'fees'],
          conflictType: 'version_mismatch' as ConflictType,
          createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
          detectedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
          lastModified: {
            local: new Date(Date.now() - 3 * 60 * 60 * 1000),
            remote: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
          lastModifiedBy: {
            local: 'exhibitor@example.com',
            remote: 'secretary@westminster.com',
          },
          metadata: {
            autoResolvable: true,
            businessRuleViolation: 'Fee mismatch requires treasurer approval',
          },
        },
        {
          id: 'conflict-3',
          entityType: 'judge',
          entityId: 'judge-789',
          entityName: 'Dr. Sarah Johnson',
          status: 'pending',
          localData: {
            name: 'Dr. Sarah Johnson',
            email: 'sarah.johnson@akc.org',
            phone: '555-0123',
            specialties: ['Sporting Group', 'Working Group'],
            availability: ['morning'],
            assignedRings: [1, 3],
          },
          remoteData: {
            name: 'Dr. Sarah Johnson',
            email: 'sarah.johnson@akc.org',
            phone: '555-0123',
            specialties: ['Sporting Group', 'Working Group', 'Herding Group'], // Added specialty
            availability: ['morning', 'afternoon'], // Extended availability
            assignedRings: [1, 3, 5], // Additional ring assignment
          },
          serverData: {
            name: 'Dr. Sarah Johnson',
            email: 'sarah.johnson@akc.org',
            phone: '555-0123',
            specialties: ['Sporting Group', 'Working Group', 'Herding Group'], // Added specialty
            availability: ['morning', 'afternoon'], // Extended availability
            assignedRings: [1, 3, 5], // Additional ring assignment
          },
          priority: 'critical' as ConflictPriority,
          conflictFields: ['specialties', 'availability', 'assignedRings'],
          conflictType: 'concurrent_edit' as ConflictType,
          createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
          detectedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
          lastModified: {
            local: new Date(Date.now() - 5 * 60 * 60 * 1000),
            remote: new Date(Date.now() - 4 * 60 * 60 * 1000),
          },
          lastModifiedBy: {
            local: 'scheduler@westminster.com',
            remote: 'judge@akc.org',
          },
          metadata: {
            autoResolvable: false,
            deadline: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now (urgent)
          },
        },
        {
          id: 'conflict-4',
          entityType: 'class',
          entityId: 'class-321',
          entityName: 'Open Bitches - Golden Retriever',
          status: 'pending',
          localData: {
            name: 'Open Bitches',
            breed: 'Golden Retriever',
            maxEntries: 25,
            ringNumber: 2,
            judgeTime: '14:30',
            entryCount: 18,
          },
          remoteData: {
            name: 'Open Bitches',
            breed: 'Golden Retriever',
            maxEntries: 30, // Increased capacity
            ringNumber: 4, // Moved to different ring
            judgeTime: '15:00', // Different time
            entryCount: 22, // Different count
          },
          serverData: {
            name: 'Open Bitches',
            breed: 'Golden Retriever',
            maxEntries: 30, // Increased capacity
            ringNumber: 4, // Moved to different ring
            judgeTime: '15:00', // Different time
            entryCount: 22, // Different count
          },
          priority: 'low' as ConflictPriority,
          conflictFields: ['maxEntries', 'ringNumber', 'judgeTime', 'entryCount'],
          conflictType: 'version_mismatch' as ConflictType,
          createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
          detectedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
          lastModified: {
            local: new Date(Date.now() - 7 * 60 * 60 * 1000),
            remote: new Date(Date.now() - 6 * 60 * 60 * 1000),
          },
          lastModifiedBy: {
            local: 'ring-steward@westminster.com',
            remote: 'superintendent@westminster.com',
          },
          metadata: {
            autoResolvable: true,
          },
        },
        {
          id: 'conflict-5',
          entityType: 'dog',
          entityId: 'dog-654',
          entityName: 'Golden Glory\'s Champion',
          status: 'pending',
          localData: {
            name: 'Golden Glory\'s Champion',
            callName: 'Glory',
            breed: 'Golden Retriever',
            sex: 'Female',
            birthDate: '2020-03-15',
            registrationNumber: 'AKC-12345',
            titles: ['CH'],
            owner: 'Jane Doe',
          },
          remoteData: {
            name: 'Golden Glory\'s Champion',
            callName: 'Glory',
            breed: 'Golden Retriever',
            sex: 'Female',
            birthDate: '2020-03-15',
            registrationNumber: 'AKC-12345',
            titles: ['CH', 'CGC'], // Added title
            owner: 'Jane Doe Smith', // Updated owner name
          },
          serverData: {
            name: 'Golden Glory\'s Champion',
            callName: 'Glory',
            breed: 'Golden Retriever',
            sex: 'Female',
            birthDate: '2020-03-15',
            registrationNumber: 'AKC-12345',
            titles: ['CH', 'CGC'], // Added title
            owner: 'Jane Doe Smith', // Updated owner name
          },
          priority: 'low' as ConflictPriority,
          conflictFields: ['titles', 'owner'],
          conflictType: 'concurrent_edit' as ConflictType,
          createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
          detectedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          lastModified: {
            local: new Date(Date.now() - 45 * 60 * 1000),
            remote: new Date(Date.now() - 30 * 60 * 1000),
          },
          lastModifiedBy: {
            local: 'owner@example.com',
            remote: 'registrar@akc.org',
          },
          metadata: {
            autoResolvable: true,
            businessRuleViolation: 'Owner name change requires verification',
          },
        },
      ];

      setDemoConflicts(sampleConflicts);
      setIsGenerating(false);
    }, 1000);
  };

  const handleConflictResolve = async (resolution: EnhancedConflictResolution) => {
    logger.debug('Resolving conflict:', 'sync', { data: resolution });
    
    // Simulate resolution processing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Remove resolved conflict from demo
    setDemoConflicts(prev => prev.filter(c => c.id !== resolution.conflictId));
  };

  const handleBulkResolve = async (conflictIds: string[], strategy: ResolutionStrategy) => {
    logger.debug('Bulk resolving conflicts:', 'sync', { data: conflictIds, 'with strategy:', strategy });
    
    // Simulate bulk resolution
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Remove resolved conflicts from demo
    setDemoConflicts(prev => prev.filter(c => !conflictIds.includes(c.id)));
  };

  const handleRefreshConflicts = async () => {
    logger.debug('Refreshing conflicts...', 'sync', {});
    await new Promise(resolve => setTimeout(resolve, 500));
  };

  const clearConflicts = () => {
    setDemoConflicts([]);
  };

  const addRandomConflict = () => {
    const entityTypes = ['show', 'entry', 'judge', 'class', 'dog'];
    const priorities: ConflictPriority[] = ['low', 'medium', 'high', 'critical'];
    const conflictTypes: ConflictType[] = 
      ['version_mismatch', 'concurrent_edit', 'delete_update', 'constraint_violation'];

    const randomConflict: Conflict = {
      id: `conflict-${Date.now()}`,
      entityType: entityTypes[Math.floor(Math.random() * entityTypes.length)],
      entityId: `entity-${Date.now()}`,
      entityName: `Random Entity ${Date.now()}`,
      localData: { field1: 'local value', field2: 123 },
      remoteData: { field1: 'remote value', field2: 456 },
      serverData: { field1: 'remote value', field2: 456 },
      priority: priorities[Math.floor(Math.random() * priorities.length)],
      conflictFields: ['field1', 'field2'],
      conflictType: conflictTypes[Math.floor(Math.random() * conflictTypes.length)],
      status: 'pending',
      createdAt: new Date(),
      detectedAt: new Date(),
      lastModified: {
        local: new Date(Date.now() - Math.random() * 60 * 60 * 1000),
        remote: new Date(Date.now() - Math.random() * 30 * 60 * 1000),
      },
      lastModifiedBy: {
        local: 'user@example.com',
        remote: 'system@example.com',
      },
      metadata: {
        autoResolvable: Math.random() > 0.5,
      },
    };

    setDemoConflicts(prev => [randomConflict, ...prev]);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Conflict Resolution System Demo
          </CardTitle>
          <CardDescription>
            Interactive demonstration of the comprehensive conflict resolution UI components.
            This showcases real-world scenarios for resolving data conflicts in a dog show management system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="demo">Live Demo</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This demo showcases Phase 4 conflict resolution UI components designed for 
                  handling data conflicts in distributed, real-time collaborative environments.
                </AlertDescription>
              </Alert>

              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Key Components</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <strong>ConflictResolutionDialog:</strong> Main dialog with multiple resolution modes
                    </div>
                    <div className="text-sm">
                      <strong>ConflictComparison:</strong> Side-by-side diff visualization
                    </div>
                    <div className="text-sm">
                      <strong>ConflictResolutionWizard:</strong> Step-by-step guided resolution
                    </div>
                    <div className="text-sm">
                      <strong>FieldConflictResolver:</strong> Granular field-level conflict handling
                    </div>
                    <div className="text-sm">
                      <strong>ConflictNotificationCenter:</strong> Centralized conflict alerts
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Demo Scenarios</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <Badge variant="outline" className="mr-2">Show</Badge>
                      Scheduling conflicts with multiple field changes
                    </div>
                    <div className="text-sm">
                      <Badge variant="outline" className="mr-2">Entry</Badge>
                      Class reassignment and fee structure conflicts
                    </div>
                    <div className="text-sm">
                      <Badge variant="outline" className="mr-2">Judge</Badge>
                      Assignment and availability conflicts
                    </div>
                    <div className="text-sm">
                      <Badge variant="outline" className="mr-2">Class</Badge>
                      Capacity and scheduling adjustments
                    </div>
                    <div className="text-sm">
                      <Badge variant="outline" className="mr-2">Dog</Badge>
                      Registration and title updates
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="features" className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Resolution Modes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>• <strong>Quick Resolve:</strong> One-click strategy selection</div>
                    <div>• <strong>Detailed Review:</strong> Field-by-field comparison</div>
                    <div>• <strong>Merge Wizard:</strong> Guided step-by-step resolution</div>
                    <div>• <strong>History Review:</strong> Learn from past decisions</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Smart Features</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>• <strong>Auto-Resolution:</strong> AI-powered conflict suggestions</div>
                    <div>• <strong>Confidence Scoring:</strong> Resolution quality indicators</div>
                    <div>• <strong>Business Rules:</strong> Domain-specific validation</div>
                    <div>• <strong>Bulk Operations:</strong> Resolve multiple conflicts</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">User Experience</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>• <strong>Visual Diffs:</strong> Clear change highlighting</div>
                    <div>• <strong>Priority Indicators:</strong> Urgency-based sorting</div>
                    <div>• <strong>Real-time Notifications:</strong> Instant conflict alerts</div>
                    <div>• <strong>Mobile Responsive:</strong> Touch-friendly interface</div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="demo" className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={generateSampleConflicts}
                    disabled={isGenerating}
                    className="bg-gradient-to-r from-primary to-secondary"
                  >
                    {isGenerating ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    {isGenerating ? 'Generating...' : 'Load Sample Conflicts'}
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={addRandomConflict}
                    disabled={isGenerating}
                  >
                    <Shuffle className="h-4 w-4 mr-2" />
                    Add Random
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={clearConflicts}
                    disabled={demoConflicts.length === 0}
                  >
                    Clear All
                  </Button>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
                  <span>{demoConflicts.length} active conflicts</span>
                  {demoConflicts.filter(c => c.metadata?.autoResolvable).length > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-success">
                        {demoConflicts.filter(c => c.metadata?.autoResolvable).length} auto-resolvable
                      </span>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {demoConflicts.length > 0 && (
        <ConflictResolutionManager
          conflicts={demoConflicts}
          conflictResolver={conflictResolver}
          onConflictResolve={handleConflictResolve}
          onBulkResolve={handleBulkResolve}
          onRefreshConflicts={handleRefreshConflicts}
        />
      )}

      {demoConflicts.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center">
            <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">Ready to Demo</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Click "Load Sample Conflicts" above to start exploring the conflict resolution system
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};