import { Calendar, Dog, Hash, MapPin, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { formatRingLabel } from '@/utils/ringLabel';
import { EntryStatus, type ClassSelectionData } from '@/types/show-registration-types';
import type {
  ArmbandAssignment,
  DogClassDetails,
  HandlerAssignment,
} from './ConfirmationStep.types';
import { StatusBadge } from '@/components/status';
import { getDogBreedLabel, getDogRegisteredName } from '@/types/dog-types';

interface ConfirmationEntryDetailsProps {
  showId: string;
  classSelections: ClassSelectionData[];
  armbandAssignments: ArmbandAssignment[];
  handlers: HandlerAssignment[];
  entryStatus: EntryStatus;
}

export function ConfirmationEntryDetails({
  showId,
  classSelections,
  armbandAssignments,
  handlers,
  entryStatus,
}: ConfirmationEntryDetailsProps) {
  const { dogs } = useDogStoreCompat();
  const { shows = [] } = useShowStore();
  const { trials = [] } = useTrialStore();
  const { classes = [] } = useClassStoreCompat();
  const show = shows.find(candidate => candidate.id === showId);

  const getDogDetails = (dogId: string) => {
    const dog = dogs.find(candidate => candidate.id === dogId);
    const selection = classSelections.find(candidate => candidate.dogId === dogId);
    if (!dog || !selection) return null;

    const trial = trials.find(candidate => candidate.id === selection.trialId);
    const dogClasses: DogClassDetails[] = selection.selectedClasses.map(selectedClass => {
      const classData = classes.find(candidate => candidate.id === selectedClass.classId);
      return {
        className: classData?.className || 'Unknown Class',
        classNumber: classData?.classNumber || '',
        trialName: trial?.name || 'Unknown Trial',
        jumpHeight: selectedClass.jumpHeight,
      };
    });

    return { dog, classes: dogClasses };
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Show Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <h3 className="font-semibold">{show?.name}</h3>
              <p className="text-sm text-muted-foreground">{show?.clubName}</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{show && formatDateMMDDYYYY(show.startDate)}</span>
              {show?.endDate && show.endDate !== show.startDate && (
                <span>- {formatDateMMDDYYYY(show.endDate)}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{show?.location}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Dog className="h-4 w-4" />
            Registered Dogs &amp; Classes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {classSelections.map(selection => {
              const details = getDogDetails(selection.dogId);
              const armband = armbandAssignments.find(item => item.dogId === selection.dogId);
              const handler = handlers.find(item => item.dogId === selection.dogId);
              const armbandRingLabel = formatRingLabel(armband?.ring);
              if (!details) return null;

              return (
                <div key={selection.dogId} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-lg">
                        {details.dog.callName || details.dog.name}
                        {getDogRegisteredName(details.dog) &&
                          ` "${getDogRegisteredName(details.dog)}"`}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {getDogBreedLabel(details.dog)} &bull;{' '}
                        {details.dog.gender} &bull;{' '}
                        {details.dog.dateOfBirth &&
                          `Born ${formatDateMMDDYYYY(details.dog.dateOfBirth)}`}
                      </p>
                    </div>
                    <StatusBadge family="entry" status={entryStatus} variant="outline" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h5 className="font-medium text-sm mb-2">Classes:</h5>
                      <div className="space-y-1">
                        {details.classes.map((entryClass, index) => (
                          <div key={index} className="text-sm bg-muted/50 rounded p-2">
                            <div className="font-medium">
                              {entryClass.className} (#{entryClass.classNumber})
                            </div>
                            <div className="text-muted-foreground">{entryClass.trialName}</div>
                            {entryClass.jumpHeight && (
                              <div className="text-xs text-muted-foreground">
                                Jump Height: {entryClass.jumpHeight}&quot;
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h6 className="font-medium text-sm flex items-center gap-1 mb-1">
                          <Hash className="h-3 w-3" />
                          Armband
                        </h6>
                        {armband ? (
                          <div className="text-sm bg-primary/10 rounded p-2">
                            <div className="font-semibold text-primary">#{armband.armband}</div>
                            {armbandRingLabel && (
                              <div className="text-primary/70 text-xs">{armbandRingLabel}</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground italic">
                            Will be assigned closer to show date
                          </div>
                        )}
                      </div>

                      <div>
                        <h6 className="font-medium text-sm flex items-center gap-1 mb-1">
                          <User className="h-3 w-3" />
                          Handler
                        </h6>
                        {handler ? (
                          <div className="text-sm bg-green-500/10 rounded p-2">
                            <div className="font-medium text-success ">{handler.handlerName}</div>
                            <div className="text-success text-xs">
                              {handler.isOwner ? 'Owner handling' : 'Professional handler'}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground italic">
                            Owner handling (default)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
