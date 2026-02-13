import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, AlertCircle, PlusCircle, Edit, Trash2 } from 'lucide-react';
import type { Registration } from '@/types/dog-types';
import type { DogFormData } from './types';

interface RegistrationTabProps {
  formData: DogFormData;
  onRemoveRegistration: (id: string) => void;
  onEditRegistration: (reg: Registration) => void;
  onAddRegistration: () => void;
}

export const RegistrationTab: React.FC<RegistrationTabProps> = ({
  formData,
  onRemoveRegistration,
  onEditRegistration,
  onAddRegistration,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Registration Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {formData.registrations.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No registrations added yet. Click "Add New Registration" to add one.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {formData.registrations.map((reg, index) => (
              <Card key={reg.id || index} className="border-2">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-primary/10 text-primary border-primary/20">
                          {reg.organization}
                        </Badge>
                        <Badge variant="outline" className={
                          reg.status === 'active' ? 'border-green-500 text-green-700' : 'border-gray-500 text-gray-700'
                        }>
                          {reg.status}
                        </Badge>
                      </div>
                      <h4 className="font-medium text-foreground">{reg.registeredName}</h4>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>Breed: {reg.breed}</p>
                        <p>Number: {reg.registrationNumber}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditRegistration(reg)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveRegistration(reg.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Button
          variant="outline"
          className="w-full border-dashed border-2 h-12 hover:border-primary/50 hover:text-primary"
          onClick={onAddRegistration}
        >
          <PlusCircle className="h-4 w-4 mr-2" />
          Add New Registration
        </Button>
      </CardContent>
    </Card>
  );
};
