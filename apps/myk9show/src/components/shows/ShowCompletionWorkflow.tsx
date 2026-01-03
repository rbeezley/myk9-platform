import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  FileText, 
  Mail,
  Trophy,
  Users,
  CreditCard,
  Database,
  AlertTriangle,
  Printer,
  Upload
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompletionStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  required: boolean;
  icon: React.ComponentType<{ className?: string }>;
  estimatedTime?: string;
  dependencies?: string[];
}

interface ShowCompletionData {
  showId: string;
  showName: string;
  totalEntries: number;
  completedClasses: number;
  totalClasses: number;
  totalAwards: number;
  pendingPayments: number;
  resultsPublished: boolean;
  reportsGenerated: boolean;
}

interface ShowCompletionWorkflowProps {
  showData: ShowCompletionData;
  onComplete: () => void;
  onClose: () => void;
}

export function ShowCompletionWorkflow({ 
  showData, 
  onComplete, 
  onClose 
}: ShowCompletionWorkflowProps) {
  const [processing, setProcessing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [completionSteps, setCompletionSteps] = useState<CompletionStep[]>([
    {
      id: 'verify_results',
      title: 'Verify All Results',
      description: 'Confirm all classes have been judged and results recorded',
      status: showData.completedClasses === showData.totalClasses ? 'completed' : 'pending',
      required: true,
      icon: Trophy,
      estimatedTime: '5 min'
    },
    {
      id: 'process_awards',
      title: 'Process Awards',
      description: 'Calculate placements, titles, and special awards',
      status: showData.totalAwards > 0 ? 'completed' : 'pending',
      required: true,
      icon: Trophy,
      estimatedTime: '10 min',
      dependencies: ['verify_results']
    },
    {
      id: 'publish_results',
      title: 'Publish Results',
      description: 'Make final results available to exhibitors and public',
      status: showData.resultsPublished ? 'completed' : 'pending',
      required: true,
      icon: Upload,
      estimatedTime: '2 min',
      dependencies: ['process_awards']
    },
    {
      id: 'process_payments',
      title: 'Process Outstanding Payments',
      description: 'Handle refunds, outstanding balances, and payment reconciliation',
      status: showData.pendingPayments === 0 ? 'completed' : 'pending',
      required: false,
      icon: CreditCard,
      estimatedTime: '15 min'
    },
    {
      id: 'generate_reports',
      title: 'Generate Reports',
      description: 'Create final show reports, statistics, and documentation',
      status: showData.reportsGenerated ? 'completed' : 'pending',
      required: true,
      icon: FileText,
      estimatedTime: '8 min',
      dependencies: ['publish_results']
    },
    {
      id: 'send_notifications',
      title: 'Send Notifications',
      description: 'Email results and certificates to exhibitors',
      status: 'pending',
      required: false,
      icon: Mail,
      estimatedTime: '5 min',
      dependencies: ['generate_reports']
    },
    {
      id: 'backup_data',
      title: 'Backup Show Data',
      description: 'Create permanent archive of all show data and results',
      status: 'pending',
      required: true,
      icon: Database,
      estimatedTime: '10 min'
    },
    {
      id: 'print_materials',
      title: 'Print Certificates',
      description: 'Print award certificates and ribbons list',
      status: 'pending',
      required: false,
      icon: Printer,
      estimatedTime: '20 min',
      dependencies: ['process_awards']
    }
  ]);

  const executeStep = async (stepId: string) => {
    setProcessing(true);
    
    setCompletionSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, status: 'in_progress' } : step
    ));

    try {
      // Simulate step processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setCompletionSteps(prev => prev.map(step => 
        step.id === stepId ? { ...step, status: 'completed' } : step
      ));
      
    } catch {
      setCompletionSteps(prev => prev.map(step => 
        step.id === stepId ? { ...step, status: 'error' } : step
      ));
    } finally {
      setProcessing(false);
    }
  };

  const executeAllSteps = async () => {
    setProcessing(true);
    
    for (const step of completionSteps) {
      if (step.status === 'pending') {
        await executeStep(step.id);
      }
    }
    
    setProcessing(false);
    setShowConfirmDialog(true);
  };

  const getStepIcon = (step: CompletionStep) => {
    if (step.status === 'completed') return CheckCircle2;
    if (step.status === 'error') return XCircle;
    if (step.status === 'in_progress') return Clock;
    return step.icon;
  };

  const getStepColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'in_progress': return 'text-blue-600';
      default: return 'text-muted-foreground';
    }
  };

  const canExecuteStep = (step: CompletionStep) => {
    if (step.status === 'completed') return false;
    if (!step.dependencies) return true;
    
    return step.dependencies.every(depId => 
      completionSteps.find(s => s.id === depId)?.status === 'completed'
    );
  };

  const requiredStepsCompleted = completionSteps
    .filter(step => step.required)
    .every(step => step.status === 'completed');

  const totalProgress = (completionSteps.filter(step => step.status === 'completed').length / completionSteps.length) * 100;

  return (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Show Completion Workflow</span>
            <Badge variant="outline">
              {Math.round(totalProgress)}% Complete
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg">{showData.showName}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                <div>
                  <div className="text-sm text-muted-foreground">Classes</div>
                  <div className="font-semibold">
                    {showData.completedClasses}/{showData.totalClasses}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Entries</div>
                  <div className="font-semibold">{showData.totalEntries}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Awards</div>
                  <div className="font-semibold">{showData.totalAwards}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Pending Payments</div>
                  <div className={cn(
                    "font-semibold",
                    showData.pendingPayments > 0 ? "text-orange-600" : "text-green-600"
                  )}>
                    {showData.pendingPayments === 0 ? "None" : showData.pendingPayments}
                  </div>
                </div>
              </div>
            </div>
            <Progress value={totalProgress} className="w-full" />
          </div>
        </CardContent>
      </Card>

      {/* Completion Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Completion Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {completionSteps.map((step, index) => {
              const IconComponent = getStepIcon(step);
              const iconColor = getStepColor(step.status);
              const isExecutable = canExecuteStep(step);
              
              return (
                <div key={step.id} className="space-y-3">
                  <div className="flex items-start gap-4">
                    <div className={cn("p-2 rounded-full bg-muted flex-shrink-0", iconColor)}>
                      <IconComponent className={cn(
                        "h-4 w-4",
                        step.status === 'in_progress' && "animate-spin"
                      )} />
                    </div>
                    
                    <div className="flex-grow">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium flex items-center gap-2">
                            {step.title}
                            {step.required && (
                              <Badge variant="secondary" className="text-xs">
                                Required
                              </Badge>
                            )}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {step.description}
                          </p>
                          {step.estimatedTime && (
                            <p className="text-xs text-muted-foreground">
                              Est. time: {step.estimatedTime}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {step.status === 'pending' && isExecutable && (
                            <Button
                              size="sm"
                              onClick={() => executeStep(step.id)}
                              disabled={processing}
                            >
                              Execute
                            </Button>
                          )}
                          
                          {step.status === 'error' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => executeStep(step.id)}
                            >
                              Retry
                            </Button>
                          )}
                          
                          {step.status === 'completed' && (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              Complete
                            </Badge>
                          )}
                          
                          {step.status === 'pending' && !isExecutable && (
                            <Badge variant="outline">
                              Waiting
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {step.dependencies && step.dependencies.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground">
                            Depends on: {step.dependencies.map(depId => 
                              completionSteps.find(s => s.id === depId)?.title
                            ).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {index < completionSteps.length - 1 && <Separator />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button 
              variant="outline" 
              className="flex items-center gap-2"
              onClick={() => window.open(`/reports/show/${showData.showId}`, '_blank')}
            >
              <FileText className="h-4 w-4" />
              View Reports
            </Button>
            
            <Button 
              variant="outline" 
              className="flex items-center gap-2"
              onClick={() => window.open(`/results/show/${showData.showId}`, '_blank')}
            >
              <Trophy className="h-4 w-4" />
              View Results
            </Button>
            
            <Button 
              variant="outline" 
              className="flex items-center gap-2"
              onClick={() => window.open(`/entries/show/${showData.showId}`, '_blank')}
            >
              <Users className="h-4 w-4" />
              View Entries
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button 
          onClick={executeAllSteps}
          disabled={processing || totalProgress === 100}
          className="flex-1"
        >
          {processing ? (
            <>
              <Clock className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : totalProgress === 100 ? (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              All Steps Complete
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 mr-2" />
              Execute All Remaining
            </>
          )}
        </Button>
        
        <Button 
          variant="outline" 
          onClick={onClose}
          disabled={processing}
        >
          Close
        </Button>
        
        {requiredStepsCompleted && (
          <Button 
            onClick={() => setShowConfirmDialog(true)}
            disabled={processing}
            className="bg-green-600 hover:bg-green-700"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Complete Show
          </Button>
        )}
      </div>

      {/* Completion Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Complete Show?
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Are you ready to mark this show as complete? This action will:
            </p>
            
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                Finalize all results and awards
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                Archive show data permanently
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                Generate completion certificates
              </li>
              <li className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3 text-amber-600" />
                Prevent further modifications
              </li>
            </ul>
            
            <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Warning:</strong> Once completed, show results cannot be modified. 
                Ensure all scores and awards are correct before proceeding.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                setShowConfirmDialog(false);
                onComplete();
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              Complete Show
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}