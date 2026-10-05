import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/common/FormField';
import { useShowStore } from '@/store/showStore';
import { classAllowsWaitlist } from '@/utils/classAllowsWaitlist';
import { useEditPanel } from './useEditPanel';
import type { CapacityControl } from './ClassEditPanel.types';

interface ClassWaitlistFormData extends Record<string, unknown> {
  maxEntries?: number | null;
  /** null: the class follows the show's "Allow wait lists" (MYK9-1019). */
  allowsWaitlist?: boolean | null;
  editedCapacity?: CapacityControl[];
}

const onOff = (value: boolean) => (value ? 'On' : 'Off');

/**
 * The class's entry limit (`classes.max_entries`) and "Allow wait list" switch
 * (`classes.allow_waitlist`) inside Edit class (MYK9-998). Shared by the full and the
 * simple form, because which one Edit class renders depends on the shape of the class it was
 * handed. The queue itself is managed under Entries, then Waitlist.
 *
 * MYK9-1019: the switch shows the class's effective setting. A class with no setting of its own
 * follows the show's "Allow wait lists" (Waitlist tab), and says so; flipping the switch makes
 * it this class's own exception, which "Use the show setting" clears again. The show's value
 * comes from the replicated show row, so this reads correctly offline.
 */
export function ClassWaitlistFields({ showId }: { showId?: string | undefined }) {
  const { data, form } = useEditPanel<ClassWaitlistFormData>();
  const { shows } = useShowStore();
  const showAllowsWaitlist = shows.find(show => show.id === showId)?.allowsWaitlist;
  const followsShow = data.allowsWaitlist === null || data.allowsWaitlist === undefined;
  const effective = classAllowsWaitlist(data.allowsWaitlist, showAllowsWaitlist);
  const showState =
    showAllowsWaitlist === undefined ? null : `The show is set to ${onOff(showAllowsWaitlist)}.`;
  const maxEntriesError = form?.getError('maxEntries');
  // Only a control the user touched in this session is saved (see editedCapacityPatch).
  const markEdited = (control: CapacityControl) => {
    form?.setValue('editedCapacity', (previous: unknown) => {
      const edited = (previous as CapacityControl[] | undefined) ?? [];
      return edited.includes(control) ? edited : [...edited, control];
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entry limit and wait list</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          label="Entry limit"
          fieldId="maxEntries"
          optional
          error={maxEntriesError}
          hint="Blank means no limit for this class. The judge's daily capacity still applies."
        >
          <Input
            id="maxEntries"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={data.maxEntries ?? ''}
            onChange={e => {
              const raw = e.target.value.trim();
              form?.setValue('maxEntries', raw === '' ? null : Number(raw));
              markEdited('maxEntries');
            }}
            placeholder="No limit"
            aria-invalid={!!maxEntriesError}
          />
        </FormField>
        <div className="flex items-start gap-3">
          <Switch
            id="allowsWaitlist"
            aria-describedby="allowsWaitlist-source"
            checked={effective}
            onCheckedChange={checked => {
              form?.setValue('allowsWaitlist', checked);
              markEdited('allowsWaitlist');
            }}
          />
          <div className="space-y-1">
            <Label htmlFor="allowsWaitlist">Allow wait list</Label>
            <p className="text-sm text-muted-foreground">
              When this class or the judge's day is full, new entries join the wait list instead of
              being turned away. Manage the queue under Entries, then Waitlist.
            </p>
            <p className="text-sm" id="allowsWaitlist-source">
              {followsShow
                ? showAllowsWaitlist === undefined
                  ? "Follows the show's Allow wait lists setting (Waitlist tab)."
                  : `Follows show: ${onOff(showAllowsWaitlist)}. Change it for every class on the Waitlist tab.`
                : `Set for this class only. ${showState ?? ''}`.trim()}
            </p>
            {!followsShow && (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => {
                  form?.setValue('allowsWaitlist', null);
                  markEdited('allowsWaitlist');
                }}
              >
                Use the show setting
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
