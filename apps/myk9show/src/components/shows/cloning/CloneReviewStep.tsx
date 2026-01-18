import React from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { 
  Calendar,
  MapPin,
  DollarSign,
  Edit,
  AlertTriangle,
  CheckCircle,
  Clock,
  Star
} from 'lucide-react';
import { format, parseISO, addYears } from 'date-fns';

interface CloneTransformation {
  dateShift: number;
  updateJudges: boolean;
  updateFees: boolean;
  updateLocation: boolean;
  newName?: string | undefined;
  newLocation?: string | undefined;
  newEntryFee?: number | undefined;
}

interface CloneableShow {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  entryFee: number;
  entryDeadline: string;
  trials?: { id: string; name: string }[] | undefined;
  classes?: { id: string; name: string }[] | undefined;
  judgeIds?: string[] | undefined;
}

interface CloneReviewStepProps {
  originalShow: CloneableShow;
  transformation: CloneTransformation;
  onTransformationChange: (updates: Partial<CloneTransformation>) => void;
  className?: string | undefined;
}

export const CloneReviewStep: React.FC<CloneReviewStepProps> = ({
  originalShow,
  transformation,
  onTransformationChange,
  className
}) => {
  if (!originalShow) return null;

  // Calculate transformed dates
  const originalStartDate = parseISO(originalShow.startDate);
  const originalEndDate = parseISO(originalShow.endDate);
  const originalDeadline = parseISO(originalShow.entryDeadline);
  
  const newStartDate = addYears(originalStartDate, transformation.dateShift);
  const newEndDate = addYears(originalEndDate, transformation.dateShift);
  const newDeadline = addYears(originalDeadline, transformation.dateShift);

  // Get show statistics
  const getShowStats = (show: CloneableShow) => {
    const trialCount = show.trials?.length || 0;
    const classCount = show.classes?.length || 0;
    const judgeCount = show.judgeIds?.length || 0;
    
    return { trialCount, classCount, judgeCount };
  };

  const stats = getShowStats(originalShow);

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h3 className="text-lg font-semibold">Review Cloned Show</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Review and customize the cloned show details before creating
          </p>
        </div>

        {/* Comparison Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Original Show */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4" />
                Original Show
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium">{originalShow.name}</h4>
                <Badge variant="outline" className="mt-1">{originalShow.type}</Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {format(originalStartDate, 'MMM d, yyyy')} - {format(originalEndDate, 'MMM d, yyyy')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{originalShow.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>${originalShow.entryFee}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Deadline: {format(originalDeadline, 'MMM d, yyyy')}</span>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div>
                  <div className="font-medium text-blue-600">{stats.trialCount}</div>
                  <div className="text-muted-foreground">Trials</div>
                </div>
                <div>
                  <div className="font-medium text-green-600">{stats.classCount}</div>
                  <div className="text-muted-foreground">Classes</div>
                </div>
                <div>
                  <div className="font-medium text-purple-600">{stats.judgeCount}</div>
                  <div className="text-muted-foreground">Judges</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* New Show Preview */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" />
                New Cloned Show
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium">
                  {transformation.newName || originalShow.name}
                </h4>
                <Badge variant="outline" className="mt-1">{originalShow.type}</Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {format(newStartDate, 'MMM d, yyyy')} - {format(newEndDate, 'MMM d, yyyy')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{transformation.newLocation || originalShow.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>${transformation.newEntryFee || originalShow.entryFee}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Deadline: {format(newDeadline, 'MMM d, yyyy')}</span>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div>
                  <div className="font-medium text-blue-600">{stats.trialCount}</div>
                  <div className="text-muted-foreground">Trials</div>
                </div>
                <div>
                  <div className="font-medium text-green-600">{stats.classCount}</div>
                  <div className="text-muted-foreground">Classes</div>
                </div>
                <div>
                  <div className="font-medium text-purple-600">
                    {transformation.updateJudges ? '0' : stats.judgeCount}
                  </div>
                  <div className="text-muted-foreground">Judges</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Customization Options */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Edit className="h-4 w-4" />
              Customization Options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Details */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Basic Details</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Show Name</label>
                  <Input
                    value={transformation.newName || ''}
                    onChange={(e) => onTransformationChange({ newName: e.target.value })}
                    placeholder={originalShow.name}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">Date Shift (Years)</label>
                  <Input
                    type="number"
                    value={transformation.dateShift}
                    onChange={(e) => onTransformationChange({ dateShift: parseInt(e.target.value) || 1 })}
                    min="0"
                    max="10"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Update Options */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Update Options</h4>
              
              <div className="space-y-4">
                {/* Update Fees */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">Update Entry Fees</div>
                    <div className="text-xs text-muted-foreground">
                      Adjust entry fee from ${originalShow.entryFee}
                    </div>
                  </div>
                  <Switch
                    checked={transformation.updateFees}
                    onCheckedChange={(checked) => onTransformationChange({ updateFees: checked })}
                  />
                </div>

                {transformation.updateFees && (
                  <div className="ml-4">
                    <label className="text-sm font-medium">New Entry Fee ($)</label>
                    <Input
                      type="number"
                      value={transformation.newEntryFee || ''}
                      onChange={(e) => onTransformationChange({ newEntryFee: parseFloat(e.target.value) || undefined })}
                      placeholder={originalShow.entryFee.toString()}
                      min="0"
                      step="0.01"
                    />
                  </div>
                )}

                {/* Update Location */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">Update Location</div>
                    <div className="text-xs text-muted-foreground">
                      Change from "{originalShow.location}"
                    </div>
                  </div>
                  <Switch
                    checked={transformation.updateLocation}
                    onCheckedChange={(checked) => onTransformationChange({ updateLocation: checked })}
                  />
                </div>

                {transformation.updateLocation && (
                  <div className="ml-4">
                    <label className="text-sm font-medium">New Location</label>
                    <Input
                      value={transformation.newLocation || ''}
                      onChange={(e) => onTransformationChange({ newLocation: e.target.value })}
                      placeholder={originalShow.location}
                    />
                  </div>
                )}

                {/* Update Judges */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">Reset Judge Assignments</div>
                    <div className="text-xs text-muted-foreground">
                      Clear all judge assignments to assign new judges
                    </div>
                  </div>
                  <Switch
                    checked={transformation.updateJudges}
                    onCheckedChange={(checked) => onTransformationChange({ updateJudges: checked })}
                  />
                </div>

                {transformation.updateJudges && (
                  <div className="ml-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-yellow-800">
                        <div className="font-medium">Judge Assignments Will Be Cleared</div>
                        <div>You'll need to reassign judges for all classes in the cloned show.</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* What Will Be Cloned */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-blue-900">
              <CheckCircle className="h-4 w-4" />
              What Will Be Cloned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3" />
                  <span>All show details and settings</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3" />
                  <span>All trials with dates adjusted</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3" />
                  <span>All classes and configurations</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3" />
                  <span>Template field overrides</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3" />
                  <span>Club and organization settings</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3" />
                  <span>Entry requirements and rules</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CloneReviewStep;