import { ScrollText } from 'lucide-react';
import { FormField } from '@/components/common/FormField';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ShowEditFormData } from './ShowEditPanel.types';

/** The select's "nothing chosen" value; saved as null. */
const UNSET = 'unset';

const SANCTION_LABELS = { pending: 'Pending', approved: 'Approved' } as const;
const SPECTATOR_LABELS = { allowed: 'Allowed', not_allowed: 'Not allowed' } as const;

type AscaFactField =
  'ascaSanctionStatus' | 'scentsByLevel' | 'spectatorsPolicy' | 'photographerContact';

interface ShowAscaFactsCardProps {
  data: Pick<ShowEditFormData, AscaFactField>;
  handleValueChange: (field: AscaFactField) => (value: string) => void;
}

/**
 * MYK9-2290: the ASCA premium facts typed once on the show (§1.5.2, §1.5.9, §1.5.19, §1.5.24).
 * The premium list prints each one that is set, in every style. Shown for ASCA shows only.
 */
export function ShowAscaFactsCard({ data, handleValueChange }: ShowAscaFactsCardProps) {
  const choose = (field: AscaFactField) => (value: string | null) =>
    handleValueChange(field)(!value || value === UNSET ? '' : value);

  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          ASCA Show Details
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          ASCA asks every premium list to state these. Each one you fill in prints in the premium
          list.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField label="Sanctioning status" fieldId="ascaSanctionStatus" optional>
          <Select
            value={data.ascaSanctionStatus || UNSET}
            onValueChange={choose('ascaSanctionStatus')}
          >
            <SelectTrigger id="ascaSanctionStatus">
              <SelectValue placeholder="Not set">
                {data.ascaSanctionStatus
                  ? SANCTION_LABELS[data.ascaSanctionStatus as keyof typeof SANCTION_LABELS]
                  : 'Not set'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Not set</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Scents used for each level"
          fieldId="scentsByLevel"
          optional
          hint="For example: Novice birch; Open birch and anise; Excellent birch, anise and clove."
        >
          <Textarea
            id="scentsByLevel"
            rows={3}
            value={data.scentsByLevel ?? ''}
            onChange={event => handleValueChange('scentsByLevel')(event.target.value)}
            aria-describedby="scentsByLevel-hint"
          />
        </FormField>

        <FormField label="Spectators and videoing" fieldId="spectatorsPolicy" optional>
          <Select value={data.spectatorsPolicy || UNSET} onValueChange={choose('spectatorsPolicy')}>
            <SelectTrigger id="spectatorsPolicy">
              <SelectValue placeholder="Not set">
                {data.spectatorsPolicy
                  ? SPECTATOR_LABELS[data.spectatorsPolicy as keyof typeof SPECTATOR_LABELS]
                  : 'Not set'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Not set</SelectItem>
              <SelectItem value="allowed">Allowed</SelectItem>
              <SelectItem value="not_allowed">Not allowed</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Show photographer contact"
          fieldId="photographerContact"
          optional
          hint="Leave blank if the show has no photographer."
        >
          <Input
            id="photographerContact"
            value={data.photographerContact ?? ''}
            onChange={event => handleValueChange('photographerContact')(event.target.value)}
            aria-describedby="photographerContact-hint"
          />
        </FormField>
      </CardContent>
    </Card>
  );
}
