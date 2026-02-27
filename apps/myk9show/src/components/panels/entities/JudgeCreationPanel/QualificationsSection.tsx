import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarIcon, Plus, X, Award } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { JUDGE_ORGANIZATIONS, JUDGE_LEVELS, DISCIPLINES } from './constants';
import type { JudgeQualificationDetailed } from '@/types/dog-types';
import type { JudgeFormData } from './types';

interface QualificationsSectionProps {
  formData: JudgeFormData;
  isExpanded: boolean;
  getVisibleError: (field: string) => string | undefined;
  onToggleExpanded: () => void;
  onInputChange: (field: keyof JudgeFormData, value: unknown) => void;
}

export const QualificationsSection: React.FC<QualificationsSectionProps> = ({
  formData,
  isExpanded,
  getVisibleError,
  onToggleExpanded,
  onInputChange,
}) => {
  const addQualification = () => {
    const newQualification: JudgeQualificationDetailed = {
      organization: 'AKC',
      level: JUDGE_LEVELS.AKC[0],
      disciplines: [],
      dateObtained: null,
      expirationDate: null,
    };
    onInputChange('qualifications', [...formData.qualifications, newQualification]);
  };

  const updateQualification = (index: number, updates: Partial<JudgeQualificationDetailed>) => {
    const newQualifications = [...formData.qualifications];
    newQualifications[index] = { ...newQualifications[index], ...updates };
    onInputChange('qualifications', newQualifications);
  };

  const removeQualification = (index: number) => {
    onInputChange('qualifications', formData.qualifications.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={onToggleExpanded}>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            Qualifications
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            {formData.qualifications.length} qualification{formData.qualifications.length !== 1 ? 's' : ''}
          </span>
        </CardTitle>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          {getVisibleError('qualifications') && (
            <p className="text-sm text-destructive">{getVisibleError('qualifications')}</p>
          )}

          {formData.qualifications.map((qual, index) => (
            <div key={index} className="p-4 border rounded-lg space-y-4">
              <div className="flex items-start justify-between">
                <h4 className="font-medium">Qualification {index + 1}</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeQualification(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Organization</Label>
                  <Select
                    value={qual.organization}
                    onValueChange={(value) => updateQualification(index, {
                      organization: value as JudgeQualificationDetailed['organization'],
                      level: JUDGE_LEVELS[value as keyof typeof JUDGE_LEVELS][0]
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JUDGE_ORGANIZATIONS.map((org) => (
                        <SelectItem key={org.value} value={org.value}>
                          {org.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Level</Label>
                  <Select
                    value={qual.level}
                    onValueChange={(value) => updateQualification(index, { level: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JUDGE_LEVELS[qual.organization]?.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Disciplines</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {DISCIPLINES.map((discipline) => (
                    <div key={discipline} className="flex items-center space-x-2">
                      <Checkbox
                        id={`qual-${index}-${discipline}`}
                        checked={qual.disciplines.includes(discipline)}
                        onCheckedChange={(checked) => {
                          const newDisciplines = checked
                            ? [...qual.disciplines, discipline]
                            : qual.disciplines.filter(d => d !== discipline);
                          updateQualification(index, { disciplines: newDisciplines });
                        }}
                      />
                      <Label
                        htmlFor={`qual-${index}-${discipline}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {discipline}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date Obtained</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !qual.dateObtained && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {qual.dateObtained ? format(qual.dateObtained, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={qual.dateObtained || undefined}
                        onSelect={(date) => updateQualification(index, { dateObtained: date || null })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Expiration Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !qual.expirationDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {qual.expirationDate ? format(qual.expirationDate, "PPP") : "No expiration"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={qual.expirationDate || undefined}
                        onSelect={(date) => updateQualification(index, { expirationDate: date || null })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            onClick={addQualification}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Qualification
          </Button>
        </CardContent>
      )}
    </Card>
  );
};
