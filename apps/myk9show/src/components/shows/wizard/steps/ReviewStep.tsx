import React, { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Trophy,
  CheckCircle,
  Edit,
  Building2,
  Save,
  FileText,
  Eye,
  AlertTriangle,
  ArrowLeft,
  Users,
  Loader2,
} from 'lucide-react';
import { useWizardStore } from '@/store/wizardStore';
import { useClubStore } from '@/store/clubStore';
import { useResolvePersonName } from '@/hooks/useResolvePersonName';
import { format } from 'date-fns';
import { formatFee } from '@/utils/format';

interface ReviewStepProps {
  className?: string;
  isLoading?: boolean;
  onSaveDraft?: () => void;
  onCreateShow?: () => void;
  onCreateAndPublish?: () => void;
  onBack?: () => void;
}

export const ReviewStep: React.FC<ReviewStepProps> = ({
  className,
  isLoading = false,
  onSaveDraft,
  onCreateShow,
  onCreateAndPublish,
  onBack,
}) => {
  const { show, trials, judgeDetails, markStepCompleted, setCurrentStep } = useWizardStore();
  const { clubs } = useClubStore();
  const resolvePersonName = useResolvePersonName();

  // Calculate summary stats
  const totalClasses = trials.reduce((sum, trial) => sum + trial.classes.length, 0);
  const totalJudges = show.judgeIds.length;

  // Derive validation errors from current state (no useState needed)
  const errors = useMemo(() => {
    const result: string[] = [];

    if (!show.name.trim()) result.push('Show name is required');
    if (!show.startDate || !show.endDate) result.push('Show dates are required');
    if (!show.location?.trim()) result.push('Location is required');
    if (!show.clubId) result.push('Club selection is required');
    if (show.officials.chairman.length === 0) result.push('Show chairman is required');
    if (show.officials.secretary.length === 0) result.push('Show secretary is required');
    if (trials.length === 0) result.push('At least one trial is required');
    if (totalClasses === 0) result.push('At least one class must be configured');

    return result;
  }, [
    show.name,
    show.startDate,
    show.endDate,
    show.location,
    show.clubId,
    show.officials,
    trials,
    totalClasses,
  ]);

  // Mark step complete when valid
  useEffect(() => {
    if (errors.length === 0) {
      markStepCompleted(3);
    }
  }, [errors.length, markStepCompleted]);

  // Count unique judges assigned across all trials
  const assignedJudgeIds = trials.flatMap(trial =>
    trial.classes.map(cls => cls.judgeId).filter(Boolean)
  );
  const uniqueAssignedJudges = new Set(assignedJudgeIds).size;
  const classesWithJudges = assignedJudgeIds.length;

  return (
    <div className={className}>
      <div className="space-y-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Validation Errors */}
          {errors.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-red-900 mb-2">
                      Please address the following issues:
                    </h4>
                    <ul className="space-y-1">
                      {errors.map((error, index) => (
                        <li key={index} className="text-sm text-red-700">
                          • {error}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Overview Stats - Enhanced with gradients */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Trials Card */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-6 text-white shadow-lg">
              <Calendar className="absolute -right-3 -bottom-3 h-20 w-20 text-white/10" />
              <div className="relative">
                <p className="text-sm font-medium text-white/80">Trials</p>
                <p className="text-4xl font-bold mt-1">{trials.length}</p>
              </div>
            </div>

            {/* Classes Card */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-white shadow-lg">
              <Trophy className="absolute -right-3 -bottom-3 h-20 w-20 text-white/10" />
              <div className="relative">
                <p className="text-sm font-medium text-white/80">Classes</p>
                <p className="text-4xl font-bold mt-1">{totalClasses}</p>
              </div>
            </div>

            {/* Show Dates Card */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 p-6 text-white shadow-lg">
              <Calendar className="absolute -right-3 -bottom-3 h-20 w-20 text-white/10" />
              <div className="relative">
                <p className="text-sm font-medium text-white/80">Show Dates</p>
                <p className="text-lg font-bold mt-1">
                  {show.startDate ? format(new Date(show.startDate), 'MMM d') : 'TBD'}
                  {show.endDate && show.endDate !== show.startDate && (
                    <span> – {format(new Date(show.endDate), 'MMM d')}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Entry Window Card */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 p-6 text-white shadow-lg">
              <FileText className="absolute -right-3 -bottom-3 h-20 w-20 text-white/10" />
              <div className="relative">
                <p className="text-sm font-medium text-white/80">Entry Window</p>
                <p className="text-lg font-bold mt-1">
                  {show.entryOpenDate ? format(new Date(show.entryOpenDate), 'MMM d') : 'TBD'}
                  {show.entryCloseDate && (
                    <span> – {format(new Date(show.entryCloseDate), 'MMM d')}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Judges Card */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 p-6 text-white shadow-lg">
              <Users className="absolute -right-3 -bottom-3 h-20 w-20 text-white/10" />
              <div className="relative">
                <p className="text-sm font-medium text-white/80">Judges Assigned</p>
                <p className="text-4xl font-bold mt-1">
                  {uniqueAssignedJudges}
                  <span className="text-2xl text-white/60">/{totalJudges}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Show Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Show Details
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCurrentStep(0)}>
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground">Show Name</div>
                  <div className="text-foreground font-medium">{show.name}</div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Organization</div>
                  <div className="text-foreground font-medium">{show.organization}</div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Start Date</div>
                  <div className="text-foreground font-medium">
                    {show.startDate && format(new Date(show.startDate), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">End Date</div>
                  <div className="text-foreground font-medium">
                    {show.endDate && format(new Date(show.endDate), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Location</div>
                  <div className="text-foreground font-medium">
                    {show.location || 'Not specified'}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Chairman</div>
                  <div className="text-foreground font-medium">
                    {resolvePersonName(show.officials.chairman[0])}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Secretary</div>
                  <div className="text-foreground font-medium">
                    {resolvePersonName(show.officials.secretary[0])}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Host Club</div>
                  <div className="text-foreground font-medium">
                    {clubs.find(c => c.id === show.clubId)?.name || 'Not specified'}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Entry Open</div>
                  <div className="text-foreground font-medium">
                    {show.entryOpenDate &&
                      format(new Date(show.entryOpenDate), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Entry Close</div>
                  <div className="text-foreground font-medium">
                    {show.entryCloseDate &&
                      format(new Date(show.entryCloseDate), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Pre-Entry Fee</div>
                  <div className="text-foreground font-medium">{formatFee(show.preEntryFee)}</div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Day of Show Fee</div>
                  <div className="text-foreground font-medium">{formatFee(show.dayOfShowFee)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Consolidated Trials & Classes Review */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Trials & Classes Review
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(1)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit Trials
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit Classes
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {trials.map((trial, trialIndex) => (
                  <div
                    key={trial.id}
                    className="border rounded-lg p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 dark:border-blue-800"
                  >
                    {/* Trial Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-background">
                          Trial {trialIndex + 1}
                        </Badge>
                        <h4 className="font-semibold text-lg">{trial.name}</h4>
                      </div>
                    </div>

                    {/* Trial Details */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Date & Time</div>
                        <div className="text-foreground font-medium">
                          {format(new Date(trial.dateTime), "MMM d, yyyy 'at' h:mm a")}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Event Number</div>
                        <div className="text-foreground font-medium">#{trial.eventNumber}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Classes</div>
                        <div className="text-foreground font-medium">{trial.classes.length}</div>
                      </div>
                    </div>

                    {/* Classes Grid */}
                    {trial.classes.length > 0 ? (
                      <div className="space-y-3">
                        <h5 className="font-medium text-sm text-gray-700">
                          Classes & Judge Assignments
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {trial.classes.map((cls, index) => {
                            const judgeId = cls.judgeId;
                            const judge =
                              judgeId && judgeDetails[judgeId] ? judgeDetails[judgeId] : null;
                            const isUnassigned = !judge;

                            return (
                              <div key={index} className="bg-card border p-3 rounded-lg shadow-sm">
                                <div className="space-y-2">
                                  <div className="font-medium text-sm">
                                    {(cls.customizations?.className as string) || 'Class Name'}
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">Judge:</span>
                                    <Badge
                                      variant={isUnassigned ? 'destructive' : 'default'}
                                      className="text-xs"
                                    >
                                      {judge ? judge.name : 'Unassigned'}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 bg-card rounded-lg border">
                        <Trophy className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No classes configured for this trial
                        </p>
                      </div>
                    )}

                    {/* Trial Summary */}
                    <div className="mt-4 pt-3 border-t border-border">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-lg font-semibold text-blue-600">
                            {trial.classes.length}
                          </div>
                          <div className="text-xs text-muted-foreground">Classes</div>
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-green-600">
                            {
                              trial.classes.filter(cls => cls.judgeId && judgeDetails[cls.judgeId])
                                .length
                            }
                          </div>
                          <div className="text-xs text-muted-foreground">Assigned</div>
                        </div>
                        <div title="Estimated at ~15 min per class">
                          <div className="text-lg font-semibold text-purple-600">
                            ~{trial.classes.length * 15}
                          </div>
                          <div className="text-xs text-muted-foreground">Est. Minutes</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Final Actions */}
          <div className="space-y-4">
            {/* Consolidated Status Messages */}
            <div className="space-y-2">
              {/* Success Status */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium text-green-800 dark:text-green-200 text-sm">
                      Show Configuration Complete
                    </div>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                      "{show.name}" ready with {trials.length} trials and {totalClasses} classes
                    </p>
                  </div>
                </div>
              </div>

              {/* Warning if judges not fully assigned */}
              {totalJudges > 0 && classesWithJudges < totalClasses && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium text-yellow-800 dark:text-yellow-200 text-sm">
                        Incomplete Judge Assignments
                      </div>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">
                        {totalClasses - classesWithJudges} of {totalClasses} classes need judges
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation and Actions */}
            <div className="space-y-4">
              {/* Back Button */}
              <div className="flex justify-start">
                <Button variant="outline" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Classes
                </Button>
              </div>

              {/* Main Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={onSaveDraft}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save as Draft
                </Button>

                <Button
                  variant="secondary"
                  onClick={onCreateShow}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  Create Show (Unpublished)
                </Button>

                <Button onClick={onCreateAndPublish} disabled={isLoading} className="flex-1">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Eye className="h-4 w-4 mr-2" />
                  )}
                  {isLoading ? 'Creating...' : 'Create & Publish Show'}
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground text-center">
              <p>Draft: Save progress and continue later</p>
              <p>Create: Create show but keep private until you're ready</p>
              <p>Create & Publish: Make show immediately visible for entries</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewStep;
