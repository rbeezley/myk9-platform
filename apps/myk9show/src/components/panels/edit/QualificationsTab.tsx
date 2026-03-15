import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, Settings } from 'lucide-react';
import { supabase } from '@/services/database/supabaseClient';

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
  const { data: qualifications = [] } = useQuery({
    queryKey: ['judgeQualifications', personId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('judge_qualifications')
        .select('*')
        .eq('person_id', personId)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!personId,
    staleTime: 10_000,
  });

  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Judge Qualifications
          </div>
          {canEditQualifications && (
            <Button variant="outline" size="sm" onClick={onManageQualifications} className="gap-2">
              <Settings className="h-4 w-4" />
              Manage Qualifications
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {qualifications.length > 0 ? (
          <div className="space-y-4">
            {qualifications.map((qual: Record<string, unknown>) => (
              <div key={qual.id as string} className="border-l-4 border-primary pl-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="default">{qual.organization as string}</Badge>
                    <span className="font-medium">{qual.qualification_level as string}</span>
                  </div>
                  <Badge variant="default">Active</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {qual.date_obtained && (
                    <p>Certified: {new Date(qual.date_obtained as string).toLocaleDateString()}</p>
                  )}
                  {Array.isArray(qual.disciplines) && (qual.disciplines as string[]).length > 0 && (
                    <div className="mt-2">
                      <span className="font-medium">Qualified for: </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(qual.disciplines as string[]).map(type => (
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
            <h3 className="text-lg font-medium text-foreground mb-2">No Judge Qualifications</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This user has no judge qualifications on record.
            </p>
            {canEditQualifications && (
              <Button variant="outline" onClick={onManageQualifications} className="gap-2">
                <Award className="h-4 w-4" />
                Add Qualifications
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
