import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { FormField } from '@/components/common/FormField';
import { useShowStore } from '@/store/showStore';
import { useEntriesByClassQuery } from '@/hooks/queries/useClassesDatabase';
import { formatFeeDollars } from '@/features/_shared/juniorFeeLimit';
import { useEditPanel } from './useEditPanel';
import { classEntryFeeHint, existingEntriesFeeNote, parseShowFee } from './classEntryFeeCopy';

interface ClassEntryFeeFormData extends Record<string, unknown> {
  /** `classes.entry_fee`; 0 or absent is "no fee of its own" (the show's fee is charged). */
  entryFee?: number;
  /** Set once the user changes the fee in this session; only then is it saved. */
  entryFeeEdited?: boolean;
}

/**
 * "Entry fee for this class" inside Edit class (MYK9-1931). The show's fee is the default and
 * a class's own fee wins when one is set (`private.price_entry_fee`), so the field is empty
 * unless the secretary chose a fee for this class. Shared by the full and the simple form, the
 * same way the entry limit is. Changing it never reprices an entry that already exists; the
 * note says so when the class has entries.
 */
export function ClassEntryFeeField({
  showId,
  classId,
}: {
  showId?: string | undefined;
  classId?: string | undefined;
}) {
  const { data, form } = useEditPanel<ClassEntryFeeFormData>();
  const { shows } = useShowStore();
  const showFee = parseShowFee(shows.find(show => show.id === showId)?.preEntryFee);
  const entries = useEntriesByClassQuery(classId ?? '', Boolean(classId));
  const entryCount = entries.data?.length ?? 0;
  const error = form?.getError('entryFee');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entry fee</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <FormField
          label="Entry fee for this class"
          fieldId="classEntryFee"
          optional
          error={error}
          hint={classEntryFeeHint(showFee === null ? null : formatFeeDollars(showFee))}
        >
          <CurrencyInput
            id="classEntryFee"
            value={data.entryFee}
            onChange={value => {
              form?.setValue('entryFee', value);
              form?.setValue('entryFeeEdited', true);
            }}
            placeholder="Show's fee"
            aria-invalid={!!error}
            aria-describedby="classEntryFee-hint"
          />
        </FormField>
        {entryCount > 0 && (
          <p className="text-xs text-muted-foreground">{existingEntriesFeeNote(entryCount)}</p>
        )}
      </CardContent>
    </Card>
  );
}
