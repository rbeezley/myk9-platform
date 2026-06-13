import React from 'react';
import { Award, Plus, Settings } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useJudgeQualifications } from '@/hooks/queries/useJudgeDatabase';

interface JudgeQualificationsCardProps {
  personId: string;
  canManageQualifications: boolean;
  onManageQualifications: () => void;
}

const JudgeQualificationsCard: React.FC<JudgeQualificationsCardProps> = ({
  personId,
  canManageQualifications,
  onManageQualifications,
}) => {
  const { data: dbQualifications = [], isLoading } = useJudgeQualifications(personId);

  return (
    <Card
      className="group bg-gradient-to-br from-card/95 to-card/80 myk9-subtle-card-border
                     rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                     hover:shadow-xl hover:-translate-y-1 hover:border-primary/20"
    >
      <div
        className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.02] to-transparent
                      opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl"
      />

      <div className="relative space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-xl">
              <Award className="h-5 w-5 text-warning " />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Judge Qualifications
            </h3>
          </div>

          {canManageQualifications && (
            <Button
              variant="outline"
              size="sm"
              onClick={onManageQualifications}
              className="gap-2 bg-gradient-to-r from-muted/50 to-muted/30 border-border/30
                        hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10
                        hover:border-primary/20 hover:scale-105 transition-all duration-300"
            >
              <Settings className="h-4 w-4" />
              Manage Qualifications
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div
                key={i}
                className="animate-pulse rounded-xl border-l-4 border-amber-500/30 bg-muted/10 p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="h-6 w-16 rounded-full bg-muted" />
                  <div className="h-6 w-16 rounded-full bg-muted" />
                </div>
                <div className="h-4 w-32 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : dbQualifications.length > 0 ? (
          <div className="space-y-6">
            {dbQualifications.map(qual => (
              <div
                key={qual.id}
                className="relative p-5 bg-gradient-to-br from-muted/20 to-muted/10
                                         border-l-4 border-amber-500 rounded-xl
                                         hover:from-muted/30 hover:to-muted/20
                                         transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Badge
                      className="bg-gradient-to-r from-amber-500/20 to-amber-500/10
                                    text-warning border-amber-500/30
                                    font-medium px-3 py-1"
                    >
                      {qual.organization}
                    </Badge>
                    <span className="font-semibold text-foreground">
                      {qual.disciplines?.length
                        ? qual.disciplines.join(', ')
                        : qual.qualification_level || 'General'}
                    </span>
                  </div>
                  <Badge
                    className={`font-medium px-3 py-1 ${
                      qual.is_active
                        ? 'bg-gradient-to-r from-green-500/20 to-green-500/10 text-green-700 dark:text-green-300 border-green-500/30'
                        : qual.suspension_date
                          ? 'bg-gradient-to-r from-red-500/20 to-red-500/10 text-destructive border-red-500/30'
                          : 'bg-gradient-to-r from-gray-500/20 to-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/30'
                    }`}
                  >
                    {qual.is_active ? 'Active' : qual.suspension_date ? 'Suspended' : 'Expired'}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {qual.date_obtained && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                        Certified:
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {new Date(qual.date_obtained).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  {qual.judge_number && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                        Judge #:
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {qual.judge_number}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div
              className="p-4 bg-gradient-to-br from-amber-500/5 to-amber-500/10
                           rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center"
            >
              <Award className="h-10 w-10 text-amber-500" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-3">No Judge Qualifications</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              This user has no judge qualifications on record. Add qualifications to enable judging
              privileges.
            </p>
            {canManageQualifications && (
              <Button
                variant="outline"
                onClick={onManageQualifications}
                className="gap-3 bg-gradient-to-r from-muted/50 to-muted/30 border-border/30
                          hover:bg-gradient-to-r hover:from-amber-500/5 hover:to-amber-500/10
                          hover:border-amber-500/20 hover:scale-105 transition-all duration-300 px-6 py-3"
              >
                <Plus className="h-4 w-4" />
                Add Qualifications
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default JudgeQualificationsCard;
