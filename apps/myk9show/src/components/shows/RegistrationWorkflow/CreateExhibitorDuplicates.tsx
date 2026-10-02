import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CheckCircle } from 'lucide-react';
import type { PersonIdentityCandidate } from '@/utils/personIdentity';

/** The "Possible Duplicates" tab body of the entry-flow Add Person dialog. */
export function CreateExhibitorDuplicates({
  duplicates,
  onSelect,
  onAddAnyway,
}: {
  duplicates: PersonIdentityCandidate[];
  onSelect: (candidate: PersonIdentityCandidate) => void;
  onAddAnyway: () => void;
}) {
  return duplicates.length === 0 ? (
    <div className="text-center py-8 text-muted-foreground">
      <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
      <p>No potential duplicates found.</p>
      <p className="text-sm">You can proceed with adding the new person.</p>
    </div>
  ) : (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Found {duplicates.length} potential duplicate(s). Review these carefully:
      </p>

      {duplicates.map(candidate => (
        <div key={candidate.person.id} className="border rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold">
                  {candidate.person.firstName} {candidate.person.lastName}
                </h4>
                <Badge variant={candidate.score >= 10 ? 'destructive' : 'secondary'}>
                  Possible match
                </Badge>
              </div>

              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Email: {candidate.person.email}</p>
                <p>Phone: {candidate.person.phone}</p>
                {candidate.person.streetAddress && (
                  <p>
                    Address: {candidate.person.streetAddress}, {candidate.person.city},{' '}
                    {candidate.person.state} {candidate.person.zipCode}
                  </p>
                )}
              </div>

              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Match reasons:</p>
                <div className="flex flex-wrap gap-1">
                  {candidate.reasons.map((reason, reasonIdx) => (
                    <Badge key={reasonIdx} variant="outline" className="text-xs">
                      {reason}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelect(candidate)}
              className="ml-4"
            >
              Use This Person
            </Button>
          </div>
        </div>
      ))}

      <Separator />

      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">
          None of these match? Continue adding a new person.
        </p>
        <Button variant="outline" onClick={() => onAddAnyway()}>
          Add Person Anyway
        </Button>
      </div>
    </div>
  );
}
