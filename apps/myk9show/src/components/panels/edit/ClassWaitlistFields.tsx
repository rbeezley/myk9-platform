import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/common/FormField';
import { useEditPanel } from './useEditPanel';

interface ClassWaitlistFormData extends Record<string, unknown> {
  maxEntries?: number | null;
  allowsWaitlist?: boolean;
}

/**
 * The class's entry limit (`classes.max_entries`) and "Allow wait list" switch
 * (`classes.allow_waitlist`) inside Edit class (MYK9-998). Shared by the full and the
 * simple form, because which one Edit class renders depends on the shape of the class it was
 * handed. The queue itself is managed under Entries, then Waitlist.
 */
export function ClassWaitlistFields() {
  const { data, form } = useEditPanel<ClassWaitlistFormData>();
  const maxEntriesError = form?.getError('maxEntries');

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
            }}
            onBlur={() => form?.touchField('maxEntries')}
            placeholder="No limit"
            aria-invalid={!!maxEntriesError}
          />
        </FormField>
        <div className="flex items-start gap-3">
          <Switch
            id="allowsWaitlist"
            checked={data.allowsWaitlist ?? false}
            onCheckedChange={checked => {
              form?.setValue('allowsWaitlist', checked);
              form?.touchField('allowsWaitlist');
            }}
          />
          <div className="space-y-1">
            <Label htmlFor="allowsWaitlist">Allow wait list</Label>
            <p className="text-sm text-muted-foreground">
              When this class or the judge's day is full, new entries join the wait list instead of
              being turned away. Manage the queue under Entries, then Waitlist.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
