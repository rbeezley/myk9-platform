import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, Hash, Plus, Settings } from 'lucide-react';
import { useJudgeQualifications } from '@/hooks/queries/useJudgeDatabase';
import { getQualificationsReadState } from '@/features/judges/qualificationsReadState';
import { formatDateOnly } from '@/lib/format/dates';

interface QualificationsTabProps {
  personId: string;
  canEditQualifications: boolean;
  onManageQualifications: () => void;
}

export const QualificationsTab: React.FC<QualificationsTabProps> = ({
  personId,
  canEditQualifications,
  onManageQualifications,
}) => {
  const query = useJudgeQualifications(personId, { is_active: true });
  const { data: qualifications, refetch } = query;
  // MYK9-2394: "No active judge qualifications" only after a confirmed read.
  const readState = getQualificationsReadState(query);
  const canEdit = canEditQualifications && readState === 'ready';

  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Judge Qualifications
            {qualifications[0]?.judge_number && (
              <Badge variant="outline" className="ml-1 gap-1 font-normal">
                <Hash className="h-3 w-3" />
                {qualifications[0].judge_number}
              </Badge>
            )}
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={onManageQualifications} className="gap-2">
              <Settings className="h-4 w-4" />
              Manage Qualifications
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {readState === 'loading' ? (
          <p role="status" className="py-8 text-center text-sm text-muted-foreground">
            Loading qualifications...
          </p>
        ) : readState === 'unavailable' ||
          (readState === 'stale' && qualifications.length === 0) ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-muted-foreground">
              Couldn't load this person's judge qualifications.
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : qualifications.length > 0 ? (
          <div className="space-y-4">
            {readState === 'stale' && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
              >
                <span>Could not refresh. Showing the last list that loaded.</span>
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  Try again
                </Button>
              </div>
            )}
            {qualifications.map(qual => (
              <div key={qual.id} className="border-l-4 border-primary pl-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="default">{qual.organization}</Badge>
                    <span className="font-medium">{qual.qualification_level}</span>
                  </div>
                  <Badge variant="default">Active</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {qual.date_obtained && <p>Certified: {formatDateOnly(qual.date_obtained)}</p>}
                  {qual.disciplines.length > 0 && (
                    <div className="mt-2">
                      <span className="font-medium">Show Types: </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {qual.disciplines.map(type => (
                          <Badge key={type} variant="outline" className="text-xs">
                            {type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No active judge qualifications
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              This user has no active judge qualifications.
            </p>
            {canEdit && (
              <Button variant="outline" onClick={onManageQualifications} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Qualifications
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
