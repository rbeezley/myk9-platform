import React, { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Trophy, Edit, Building2, FileText, AlertTriangle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useWizardStore } from '@/store/wizardStore';
import { useClubStore } from '@/store/clubStore';
import { useResolvePersonName } from '@/hooks/useResolvePersonName';
import { format } from 'date-fns';
import { formatFee } from '@/utils/format';
import { formatTrialTypeLabel } from '@/types/template.types';
import { countLabel } from '@/utils/pluralize';
import { ReviewStepActions } from './ReviewStepActions';

interface ReviewStepProps {
  className?: string;
  isLoading?: boolean;
  onCreateShow?: () => void;
  onBack?: () => void;
  /** Override for the create button label. Defaults to "Create Show". */
  submitLabel?: string;
  /**
   * True when the show's existing officials could not be READ. The wizard draft
   * starts with empty officials arrays, so without this an unreadable list is
   * indistinguishable from an empty one -- and the blocking errors below would
   * demand a chairman and secretary the show may already have, with no way for
   * the secretary to see them.
   */
  officialsUnknown?: boolean | undefined;
}

export const ReviewStep: React.FC<ReviewStepProps> = ({
  className,
  isLoading = false,
  onCreateShow,
  onBack,
  submitLabel = 'Create Show',
  officialsUnknown = false,
}) => {
  const { show, trials, judgeDetails, markStepCompleted, setCurrentStep } = useWizardStore();
  const { clubs } = useClubStore();
  const resolvePersonName = useResolvePersonName();

  // Blocking issues are already listed in the error card above; this names them
  // at the moment of action so the refusal is explained rather than silent.

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
    // Unknown is not absent: when the officials read failed, these arrays prove
    // nothing, so they must not block the save.
    if (!officialsUnknown) {
      if (show.officials.chairman.length === 0) result.push('Show chairman is required');
      if (show.officials.secretary.length === 0) result.push('Show secretary is required');
    }
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
    officialsUnknown,
  ]);

  const reportBlockingErrors = () => {
    const [first] = errors;
    toast.error(
      errors.length === 1
        ? `${first} — fix that before creating this show.`
        : `${errors.length} things still need attention, starting with: ${first}.`
    );
  };

  const handleCreateShowGuarded = () => {
    if (errors.length > 0) {
      reportBlockingErrors();
      return;
    }
    onCreateShow?.();
  };

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

  // Pool judges (selected on Show Details) who were never assigned to a class.
  // The wizard writes CLASS-LEVEL judge_assignments, and the judge dashboard is
  // class-centric, so an unassigned pool judge will not see this show. Surface a
  // non-blocking warning — this is allowed (validation never requires per-class
  // judges), but the secretary should know before saving.
  const assignedJudgeIdSet = new Set(assignedJudgeIds);
  const unassignedPoolJudgeNames = show.judgeIds
    .filter(id => !assignedJudgeIdSet.has(id))
    .map(id => judgeDetails[id]?.name || 'Unknown Judge');

  return (
    <div className={className}>
      <div className="space-y-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Validation Errors */}
          {errors.length > 0 && (
            <Card className="border-destructive/30 bg-destructive/10 ">
              <CardContent className="pt-4">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-destructive mb-2">
                      Please address the following issues:
                    </h4>
                    <ul className="space-y-1">
                      {errors.map((error, index) => (
                        <li key={index} className="text-sm text-destructive ">
                          • {error}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Unassigned pool judges — non-blocking warning */}
          {unassignedPoolJudgeNames.length > 0 && (
            <Card className="border-warning/30 bg-warning/10">
              <CardContent className="pt-4">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-warning mb-1">
                      {unassignedPoolJudgeNames.length === 1
                        ? '1 judge is not assigned to any class'
                        : `${unassignedPoolJudgeNames.length} judges are not assigned to any class`}
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      {unassignedPoolJudgeNames.join(', ')} won’t see this show on their judge
                      dashboard until assigned to a class. Go back to Classes to assign them, or
                      continue and assign judges later.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => setCurrentStep(2)}>
                      <Edit className="h-4 w-4 mr-1" />
                      Assign judges to classes
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Overview Stats — flat warm-paper summary; ink counts on card-white,
              no saturated gradients (DESIGN.md: warm-paper palette, not cold glass). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Trials Card */}
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm">
              <Calendar className="absolute -right-3 -bottom-3 h-20 w-20 text-muted-foreground/10" />
              <div className="relative">
                <p className="text-sm font-medium text-muted-foreground">Trials</p>
                <p className="text-4xl font-bold mt-1 text-foreground">{trials.length}</p>
              </div>
            </div>

            {/* Classes Card */}
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm">
              <Trophy className="absolute -right-3 -bottom-3 h-20 w-20 text-muted-foreground/10" />
              <div className="relative">
                <p className="text-sm font-medium text-muted-foreground">Classes</p>
                <p className="text-4xl font-bold mt-1 text-foreground">{totalClasses}</p>
              </div>
            </div>

            {/* Show Dates Card */}
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm">
              <Calendar className="absolute -right-3 -bottom-3 h-20 w-20 text-muted-foreground/10" />
              <div className="relative">
                <p className="text-sm font-medium text-muted-foreground">Show Dates</p>
                <p className="text-lg font-bold mt-1 text-foreground">
                  {show.startDate ? format(new Date(show.startDate), 'MMM d') : 'TBD'}
                  {show.endDate && show.endDate !== show.startDate && (
                    <span> – {format(new Date(show.endDate), 'MMM d')}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Entry Window Card */}
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm">
              <FileText className="absolute -right-3 -bottom-3 h-20 w-20 text-muted-foreground/10" />
              <div className="relative">
                <p className="text-sm font-medium text-muted-foreground">Entry Window</p>
                <p className="text-lg font-bold mt-1 text-foreground">
                  {show.entryOpenDate ? format(new Date(show.entryOpenDate), 'MMM d') : 'TBD'}
                  {show.entryCloseDate && (
                    <span> – {format(new Date(show.entryCloseDate), 'MMM d')}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Judges Card */}
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm">
              <Users className="absolute -right-3 -bottom-3 h-20 w-20 text-muted-foreground/10" />
              <div className="relative">
                {/* F5: this used to read uniqueAssignedJudges/totalJudges -- judges
                    USED over judges ADDED -- under the label "Judges Assigned". Two
                    classes sharing one judge showed 1/1, and a show with no judges and
                    two uncovered classes showed 0/0, which reads as complete. A
                    readiness tile has to count the thing that must be covered, so it
                    now counts classes, agreeing with the "n of m classes need judges"
                    line below rather than contradicting it. */}
                <p className="text-sm font-medium text-muted-foreground">Classes with a Judge</p>
                <p className="text-4xl font-bold mt-1 text-foreground">
                  {classesWithJudges}
                  <span className="text-2xl text-muted-foreground">/{totalClasses}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {countLabel(uniqueAssignedJudges, 'judge')} of {countLabel(totalJudges, 'judge')}{' '}
                  added
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
                  <div key={trial.id} className="border rounded-lg p-5 bg-muted/30">
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
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Date & Time</div>
                        <div className="text-foreground font-medium">
                          {format(new Date(trial.dateTime), "MMM d, yyyy 'at' h:mm a")}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Trial Type</div>
                        <div className="text-foreground font-medium">
                          {formatTrialTypeLabel(trial.trialType)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Event Number</div>
                        <div className="text-foreground font-medium">
                          {trial.eventNumber ? `#${trial.eventNumber}` : 'Not set'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Classes</div>
                        <div className="text-foreground font-medium">{trial.classes.length}</div>
                      </div>
                    </div>

                    {/* Classes Grid */}
                    {trial.classes.length > 0 ? (
                      <div className="space-y-3">
                        <h5 className="font-medium text-sm text-foreground">
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
                        <Trophy className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No classes configured for this trial
                        </p>
                      </div>
                    )}

                    {/* Trial Summary */}
                    <div className="mt-4 pt-3 border-t border-border">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-lg font-semibold text-info ">
                            {trial.classes.length}
                          </div>
                          <div className="text-xs text-muted-foreground">Classes</div>
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-success">
                            {
                              trial.classes.filter(cls => cls.judgeId && judgeDetails[cls.judgeId])
                                .length
                            }
                          </div>
                          <div className="text-xs text-muted-foreground">Assigned</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <ReviewStepActions
            errorCount={errors.length}
            showName={show.name}
            trialCount={trials.length}
            totalClasses={totalClasses}
            totalJudges={totalJudges}
            classesWithJudges={classesWithJudges}
            isLoading={isLoading}
            submitLabel={submitLabel}
            onBack={onBack}
            onCreateShow={handleCreateShowGuarded}
          />
        </div>
      </div>
    </div>
  );
};

export default ReviewStep;
