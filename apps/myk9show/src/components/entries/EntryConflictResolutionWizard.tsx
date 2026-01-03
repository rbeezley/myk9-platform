import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  CheckCircle, 
  // Clock, 
  // User, 
  // Calendar,
  ArrowLeft,
  ArrowRight,
  Merge,
  // RotateCcw,
  Download,
  Upload,
  FileText
  // DollarSign
} from 'lucide-react';
import { SyncableShowEntry } from '@/store/entryStore';
import type { SyncConflict } from '@/types/sync-types';

interface ConflictDetails {
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  fieldType: 'text' | 'number' | 'date' | 'object' | 'array';
  importance: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

interface ResolutionChoice {
  field: string;
  choice: 'local' | 'remote' | 'merge' | 'custom';
  customValue?: unknown;
}

interface EntryConflictResolutionWizardProps {
  /** Whether the wizard is open */
  open: boolean;
  /** Callback when wizard is closed */
  onClose: () => void;
  /** Local version of the entry */
  localEntry: SyncableShowEntry;
  /** Remote version of the entry */
  remoteEntry: SyncableShowEntry;
  /** Conflict metadata */
  conflictInfo: SyncConflict;
  /** Callback when resolution is completed */
  onResolve: (resolution: ResolutionChoice[], strategy: 'local' | 'remote' | 'merge' | 'manual') => void;
  /** Loading state */
  isResolving?: boolean;
}

/**
 * EntryConflictResolutionWizard - Step-by-step conflict resolution with Apple-inspired design
 * 
 * Provides a guided workflow for resolving sync conflicts between local and remote entry versions.
 * Supports field-by-field comparison, automatic resolution suggestions, and manual resolution.
 */
export const EntryConflictResolutionWizard: React.FC<EntryConflictResolutionWizardProps> = ({
  open,
  onClose,
  localEntry,
  remoteEntry,
  conflictInfo,
  onResolve,
  isResolving = false
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [resolutionChoices, setResolutionChoices] = useState<ResolutionChoice[]>([]);
  const [autoResolveAttempted, setAutoResolveAttempted] = useState(false);

  // Analyze differences between local and remote versions
  const conflictDetails: ConflictDetails[] = useMemo(() => {
    const details: ConflictDetails[] = [];

    // Helper to compare values and determine importance
    const compareField = (field: string, local: unknown, remote: unknown, importance: ConflictDetails['importance'], description: string) => {
      if (JSON.stringify(local) !== JSON.stringify(remote)) {
        let fieldType: ConflictDetails['fieldType'] = 'text';
        
        if (typeof local === 'number' || typeof remote === 'number') fieldType = 'number';
        else if (local instanceof Date || remote instanceof Date) fieldType = 'date';
        else if (Array.isArray(local) || Array.isArray(remote)) fieldType = 'array';
        else if (typeof local === 'object' || typeof remote === 'object') fieldType = 'object';

        details.push({
          field,
          localValue: local,
          remoteValue: remote,
          fieldType,
          importance,
          description
        });
      }
    };

    // Compare entry fields by importance
    compareField('status', localEntry.status, remoteEntry.status, 'critical', 'Entry status affects competition eligibility');
    
    // Registration data comparisons
    if (localEntry.registrationData && remoteEntry.registrationData) {
      compareField('registrationData.handler', localEntry.registrationData.handler, remoteEntry.registrationData.handler, 'high', 'Handler information for competition');
      compareField('registrationData.entryFee', localEntry.registrationData.entryFee, remoteEntry.registrationData.entryFee, 'high', 'Entry fee affects payment processing');
      compareField('registrationData.paymentStatus', localEntry.registrationData.paymentStatus, remoteEntry.registrationData.paymentStatus, 'critical', 'Payment status affects entry validity');
      compareField('registrationData.armband', localEntry.registrationData.armband, remoteEntry.registrationData.armband, 'medium', 'Armband number for competition');
      compareField('registrationData.runOrder', localEntry.registrationData.runOrder, remoteEntry.registrationData.runOrder, 'medium', 'Running order position');
      compareField('registrationData.specialRequests', localEntry.registrationData.specialRequests, remoteEntry.registrationData.specialRequests, 'low', 'Special handling requests');
    }

    // Competition data comparisons
    if (localEntry.competitionData && remoteEntry.competitionData) {
      compareField('competitionData.score', localEntry.competitionData.score, remoteEntry.competitionData.score, 'critical', 'Competition score determines placement');
      compareField('competitionData.time', localEntry.competitionData.time, remoteEntry.competitionData.time, 'critical', 'Competition time affects qualification');
      compareField('competitionData.placement', localEntry.competitionData.placement, remoteEntry.competitionData.placement, 'critical', 'Final placement in class');
      compareField('competitionData.qualified', localEntry.competitionData.qualified, remoteEntry.competitionData.qualified, 'critical', 'Qualification status');
      compareField('competitionData.judgeNotes', localEntry.competitionData.judgeNotes, remoteEntry.competitionData.judgeNotes, 'medium', 'Judge feedback and notes');
    }

    // Status history comparison
    compareField('statusHistory', localEntry.statusHistory, remoteEntry.statusHistory, 'high', 'Entry status change history');

    return details.sort((a, b) => {
      const importanceOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return importanceOrder[b.importance] - importanceOrder[a.importance];
    });
  }, [localEntry, remoteEntry]);

  // Auto-resolution suggestions
  const autoResolutionSuggestions = useMemo(() => {
    const suggestions: ResolutionChoice[] = [];

    conflictDetails.forEach(detail => {
      let choice: 'local' | 'remote' | 'merge' = 'local';

      // Auto-resolution logic based on field importance and timestamps
      if (detail.importance === 'critical') {
        // For critical fields, prefer the most recent version
        choice = localEntry._lastModified > remoteEntry._lastModified ? 'local' : 'remote';
      } else if (detail.field.includes('payment')) {
        // For payment fields, prefer remote (server) version
        choice = 'remote';
      } else if (detail.field.includes('score') || detail.field.includes('time') || detail.field.includes('placement')) {
        // For competition results, prefer remote (official) version
        choice = 'remote';
      } else {
        // For other fields, prefer the most recent
        choice = localEntry._lastModified > remoteEntry._lastModified ? 'local' : 'remote';
      }

      suggestions.push({
        field: detail.field,
        choice
      });
    });

    return suggestions;
  }, [conflictDetails, localEntry, remoteEntry]);

  // Initialize resolution choices
  React.useEffect(() => {
    if (resolutionChoices.length === 0 && conflictDetails.length > 0) {
      setResolutionChoices(autoResolutionSuggestions);
    }
  }, [conflictDetails, autoResolutionSuggestions, resolutionChoices.length]);

  // Format value for display
  const formatValue = (value: unknown, fieldType: ConflictDetails['fieldType']): string => {
    if (value === null || value === undefined) return 'Not set';
    
    switch (fieldType) {
      case 'date':
        return value instanceof Date ? value.toLocaleString() : String(value);
      case 'object':
        return JSON.stringify(value, null, 2);
      case 'array':
        return Array.isArray(value) ? value.join(', ') : String(value);
      case 'number':
        return typeof value === 'number' ? value.toString() : String(value);
      default:
        return String(value);
    }
  };

  // Get choice for a field
  const getChoice = (field: string): ResolutionChoice => {
    return resolutionChoices.find(c => c.field === field) || { field, choice: 'local' };
  };

  // Update choice for a field
  const updateChoice = (field: string, choice: ResolutionChoice['choice'], customValue?: unknown) => {
    setResolutionChoices(prev => {
      const existing = prev.findIndex(c => c.field === field);
      const newChoice: ResolutionChoice = { field, choice, customValue };
      
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newChoice;
        return updated;
      } else {
        return [...prev, newChoice];
      }
    });
  };

  // Apply auto-resolution
  const handleAutoResolve = () => {
    setResolutionChoices(autoResolutionSuggestions);
    setAutoResolveAttempted(true);
  };

  // Handle final resolution
  const handleResolve = (strategy: 'local' | 'remote' | 'merge' | 'manual') => {
    onResolve(resolutionChoices, strategy);
  };

  // Steps configuration
  const steps = [
    { id: 'overview', label: 'Conflict Overview', icon: AlertTriangle },
    { id: 'comparison', label: 'Field Comparison', icon: FileText },
    { id: 'resolution', label: 'Resolution', icon: CheckCircle }
  ];

  const currentStepConfig = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] bg-card/95 backdrop-blur-xl border-0 
                                shadow-2xl rounded-2xl p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-50 rounded-lg border border-orange-200">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold">
                  Resolve Entry Conflict
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Entry {localEntry.id} has conflicting versions
                </p>
              </div>
            </div>
            
            {/* Progress */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">Step {currentStep + 1} of {steps.length}</p>
                <p className="text-xs text-muted-foreground">{currentStepConfig.label}</p>
              </div>
              <div className="w-32">
                <Progress value={progress} className="h-2" />
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Step 1: Overview */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <Download className="h-5 w-5 text-blue-600" />
                    <span className="font-medium text-blue-800">Local Version</span>
                  </div>
                  <AlertTriangle className="h-6 w-6 text-orange-500" />
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                    <Upload className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-800">Remote Version</span>
                  </div>
                </div>
                <p className="text-muted-foreground max-w-2xl">
                  This entry has been modified both locally and remotely. We found {conflictDetails.length} 
                  conflicting {conflictDetails.length === 1 ? 'field' : 'fields'} that need your attention.
                </p>
              </div>

              {/* Conflict summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-center">Conflict Type</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center">
                    <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
                      {conflictInfo.conflictType.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-center">Last Modified</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-center">
                    <div className="text-xs text-muted-foreground">
                      Local: {localEntry._lastModified.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Remote: {remoteEntry._lastModified.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-center">Conflicts Found</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {conflictDetails.length}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {conflictDetails.filter(d => d.importance === 'critical').length} critical
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Auto-resolve option */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Merge className="h-5 w-5 text-blue-600" />
                      <div>
                        <h4 className="font-medium text-blue-800">Smart Resolution</h4>
                        <p className="text-sm text-blue-600">
                          Let us automatically suggest the best resolution for each field
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleAutoResolve}
                      className="text-blue-600 border-blue-300 hover:bg-blue-100"
                      disabled={autoResolveAttempted}
                    >
                      {autoResolveAttempted ? 'Applied' : 'Apply Smart Resolution'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2: Field Comparison */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold">Field-by-Field Comparison</h3>
                <p className="text-sm text-muted-foreground">
                  Review each conflicting field and choose your preferred version
                </p>
              </div>

              <div className="space-y-4">
                {conflictDetails.map((detail) => {
                  const choice = getChoice(detail.field);
                  
                  return (
                    <Card key={detail.field} className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge 
                              variant={detail.importance === 'critical' ? 'destructive' : 'secondary'}
                              className={
                                detail.importance === 'critical' ? 'bg-red-50 text-red-700 border-red-200' :
                                detail.importance === 'high' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                'bg-blue-50 text-blue-700 border-blue-200'
                              }
                            >
                              {detail.importance}
                            </Badge>
                            <div>
                              <h4 className="font-medium">{detail.field}</h4>
                              <p className="text-xs text-muted-foreground">{detail.description}</p>
                            </div>
                          </div>
                          
                          {/* Resolution indicator */}
                          <div className="flex items-center gap-2">
                            {choice.choice === 'local' && (
                              <Badge className="bg-blue-50 text-blue-700 border-blue-200">Local</Badge>
                            )}
                            {choice.choice === 'remote' && (
                              <Badge className="bg-green-50 text-green-700 border-green-200">Remote</Badge>
                            )}
                            {choice.choice === 'merge' && (
                              <Badge className="bg-purple-50 text-purple-700 border-purple-200">Merge</Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Local version */}
                          <div 
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              choice.choice === 'local' 
                                ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' 
                                : 'bg-muted/50 border-border hover:border-blue-200'
                            }`}
                            onClick={() => updateChoice(detail.field, 'local')}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Download className="h-4 w-4 text-blue-600" />
                              <span className="text-sm font-medium text-blue-800">Local Version</span>
                              {choice.choice === 'local' && <CheckCircle className="h-4 w-4 text-blue-600" />}
                            </div>
                            <pre className="text-xs text-foreground whitespace-pre-wrap">
                              {formatValue(detail.localValue, detail.fieldType)}
                            </pre>
                          </div>

                          {/* Remote version */}
                          <div 
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              choice.choice === 'remote' 
                                ? 'bg-green-50 border-green-300 ring-2 ring-green-200' 
                                : 'bg-muted/50 border-border hover:border-green-200'
                            }`}
                            onClick={() => updateChoice(detail.field, 'remote')}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Upload className="h-4 w-4 text-green-600" />
                              <span className="text-sm font-medium text-green-800">Remote Version</span>
                              {choice.choice === 'remote' && <CheckCircle className="h-4 w-4 text-green-600" />}
                            </div>
                            <pre className="text-xs text-foreground whitespace-pre-wrap">
                              {formatValue(detail.remoteValue, detail.fieldType)}
                            </pre>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Resolution Summary */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <h3 className="text-lg font-semibold">Resolution Summary</h3>
                <p className="text-muted-foreground">
                  Review your choices and apply the resolution
                </p>
              </div>

              {/* Resolution overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-center">Local Choices</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {resolutionChoices.filter(c => c.choice === 'local').length}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-center">Remote Choices</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {resolutionChoices.filter(c => c.choice === 'remote').length}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-center">Merge/Custom</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {resolutionChoices.filter(c => c.choice === 'merge' || c.choice === 'custom').length}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Resolution actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  onClick={() => handleResolve('local')}
                  disabled={isResolving}
                  className="h-12 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Use All Local Changes
                </Button>

                <Button
                  onClick={() => handleResolve('remote')}
                  disabled={isResolving}
                  className="h-12 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Use All Remote Changes
                </Button>

                <Button
                  onClick={() => handleResolve('merge')}
                  disabled={isResolving}
                  className="h-12 bg-purple-600 hover:bg-purple-700 text-white md:col-span-2"
                >
                  <Merge className="h-4 w-4 mr-2" />
                  Apply Custom Resolution
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-6 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between w-full">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0 || isResolving}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            <div className="flex items-center gap-2">
              {currentStep < steps.length - 1 ? (
                <Button
                  onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
                  disabled={isResolving}
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={isResolving}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EntryConflictResolutionWizard;