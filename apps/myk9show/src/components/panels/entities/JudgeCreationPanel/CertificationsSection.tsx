import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarIcon, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { JudgeCertification } from '@/types/dog-types';
import type { JudgeFormData } from './types';

interface CertificationsSectionProps {
  formData: JudgeFormData;
  isExpanded: boolean;
  getVisibleError: (field: string) => string | undefined;
  onToggleExpanded: () => void;
  onInputChange: (field: keyof JudgeFormData, value: unknown) => void;
}

export const CertificationsSection: React.FC<CertificationsSectionProps> = ({
  formData,
  isExpanded,
  getVisibleError,
  onToggleExpanded,
  onInputChange,
}) => {
  const addCertification = () => {
    const newCertification: JudgeCertification = {
      name: '',
      issuingBody: '',
      dateObtained: null,
      expirationDate: null,
      certificationNumber: '',
    };
    onInputChange('certifications', [...formData.certifications, newCertification]);
  };

  const updateCertification = (index: number, updates: Partial<JudgeCertification>) => {
    const newCertifications = [...formData.certifications];
    newCertifications[index] = { ...newCertifications[index], ...updates };
    onInputChange('certifications', newCertifications);
  };

  const removeCertification = (index: number) => {
    onInputChange('certifications', formData.certifications.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={onToggleExpanded}>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Certifications</span>
          <span className="text-sm font-normal text-muted-foreground">
            {formData.certifications.length} certification{formData.certifications.length !== 1 ? 's' : ''}
          </span>
        </CardTitle>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          {getVisibleError('certifications') && (
            <p className="text-sm text-destructive">{getVisibleError('certifications')}</p>
          )}

          {formData.certifications.map((cert, index) => (
            <div key={index} className="p-4 border rounded-lg space-y-4">
              <div className="flex items-start justify-between">
                <h4 className="font-medium">Certification {index + 1}</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCertification(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Certification Name</Label>
                  <Input
                    value={cert.name}
                    onChange={(e) => updateCertification(index, { name: e.target.value })}
                    placeholder="e.g., Canine Good Citizen Evaluator"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Issuing Body</Label>
                  <Input
                    value={cert.issuingBody}
                    onChange={(e) => updateCertification(index, { issuingBody: e.target.value })}
                    placeholder="e.g., American Kennel Club"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Certification Number</Label>
                <Input
                  value={cert.certificationNumber}
                  onChange={(e) => updateCertification(index, { certificationNumber: e.target.value })}
                  placeholder="Enter certification number"
                />
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
                          !cert.dateObtained && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {cert.dateObtained ? format(cert.dateObtained, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={cert.dateObtained || undefined}
                        onSelect={(date) => updateCertification(index, { dateObtained: date || null })}
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
                          !cert.expirationDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {cert.expirationDate ? format(cert.expirationDate, "PPP") : "No expiration"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={cert.expirationDate || undefined}
                        onSelect={(date) => updateCertification(index, { expirationDate: date || null })}
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
            onClick={addCertification}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Certification
          </Button>
        </CardContent>
      )}
    </Card>
  );
};
