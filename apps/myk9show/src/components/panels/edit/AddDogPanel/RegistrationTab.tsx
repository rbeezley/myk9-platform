import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, Edit, Trash2 } from 'lucide-react';
import type { Registration } from '@/types/dog-types';
import type { DogRegistrationIdentity } from '@/utils/dogIdentity';
import { useEditPanel } from '@/components/panels/edit/useEditPanel';
import type { DogFormData } from './types';
import { tabCardClasses } from './tabCard';
import { cn } from '@/lib/utils';
import { RegistrationIdentityStep } from './RegistrationIdentityStep';
import type { RegistrationLookupResult } from './registrationLookup';

interface RegistrationTabProps {
  onRemoveRegistration: (id: string) => void;
  onEditRegistration: (reg: Registration) => void;
  onAddRegistration: () => void;
  /**
   * Until the dog has a registration this step is the identity form (MYK9-1162):
   * these drive it. See `RegistrationIdentityStep`.
   */
  onFindDog: (identity: DogRegistrationIdentity) => Promise<RegistrationLookupResult>;
  onIdentityEdited: () => void;
  onIdentityDraftChange: (draft: boolean) => void;
  draftBlocked: boolean;
  onSaveRegistration: (registration: Registration) => void;
  onRegistrationSaved: () => void;
  /** Show managers only: skip the lookup and add the dog with no registration. */
  onSkip?: (() => void) | undefined;
  /** Inline: no card chrome of its own (see `tabCardClasses`). */
  flat?: boolean | undefined;
}

import { ADD_REGISTRATION_ATTR, REGISTRATION_HEADING_ID } from './validationTab';
import { EDIT_REGISTRATION_ATTR } from '@/components/dogs/registrationAttrs';
import { registrationStatusTone } from '@/components/dogs/registrationStatusTone';

export const RegistrationTab: React.FC<RegistrationTabProps> = ({
  onRemoveRegistration,
  onEditRegistration,
  onAddRegistration,
  onFindDog,
  onIdentityEdited,
  onIdentityDraftChange,
  draftBlocked,
  onSaveRegistration,
  onRegistrationSaved,
  onSkip,
  flat = false,
}) => {
  const { form } = useEditPanel<DogFormData>();

  if (!form) return null;

  const registrations = form.data.registrations;
  const card = tabCardClasses(flat);

  return (
    <Card className={card.card}>
      <CardHeader className={card.header}>
        <CardTitle
          id={REGISTRATION_HEADING_ID}
          tabIndex={-1}
          className="flex items-center gap-2 focus:outline-none"
        >
          <FileText className="h-5 w-5 text-primary" />
          Registration Information
        </CardTitle>
      </CardHeader>
      <CardContent className={cn('space-y-6', card.content)}>
        {registrations.length === 0 ? (
          <RegistrationIdentityStep
            onFindDog={onFindDog}
            onIdentityEdited={onIdentityEdited}
            onDraftChange={onIdentityDraftChange}
            draftBlocked={draftBlocked}
            onSaveRegistration={onSaveRegistration}
            onRegistrationSaved={onRegistrationSaved}
            onSkip={onSkip}
          />
        ) : (
          <div className="space-y-4">
            {registrations.map((reg, index) => (
              <Card key={reg.id || index} className="border-2">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-primary/10 text-primary border-primary/20">
                          {reg.organization}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            registrationStatusTone(reg.status) === 'positive'
                              ? 'border-green-500 text-green-700'
                              : 'border-gray-500 text-gray-700'
                          }
                        >
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
                        aria-label={`Edit ${reg.organization} registration ${reg.registrationNumber}`}
                        {...{ [EDIT_REGISTRATION_ATTR]: reg.id }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveRegistration(reg.id)}
                        aria-label={`Remove ${reg.organization} registration ${reg.registrationNumber}`}
                        className="text-destructive hover:text-destructive"
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

        {registrations.length > 0 && (
          <Button
            variant="outline"
            className="w-full border-dashed border-2 h-12 hover:border-primary/50 hover:text-primary"
            onClick={onAddRegistration}
            {...{ [ADD_REGISTRATION_ATTR]: '' }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New Registration
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
