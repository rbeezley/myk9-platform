/**
 * ClassChangeSettingsCard
 *
 * The show's two switches for exhibitors asking to change class (MYK9-1929,
 * MYK9-2425; docs/plan-class-change-requests.md "Switches per show"). Both
 * default to allowed. The secretary's own Change class ignores both. Each
 * switch saves on its own and only its own column (`useClassChangeSwitch.ts`).
 * Rendered by the Edit show panel's Venue & policies tab, beside the other
 * entry rules.
 */
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import {
  classChangeSettingsQueryOptions,
  useClassChangeSwitch,
  type ClassChangeSwitch,
} from './useClassChangeSwitch';

const CHECKING = "Checking this show's setting.";

function SettingSwitch({
  id,
  label,
  help,
  control,
  disabled,
}: {
  id: string;
  label: string;
  help: string;
  control: ClassChangeSwitch;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <Switch
          id={id}
          aria-describedby={`${id}-help`}
          checked={control.checked}
          disabled={disabled || control.isPending}
          onCheckedChange={checked => control.save(checked)}
        />
        {/* The label is the switch's 44px target (docs/INTENT.md § Accessibility First). */}
        <Label htmlFor={id} className="flex min-h-11 items-center">
          {label}
        </Label>
      </div>
      <p className="text-sm text-muted-foreground" id={`${id}-help`}>
        {help}
      </p>
      {control.isError && (
        <p className="text-sm text-destructive" role="alert">
          Couldn't save that change. Check your connection and try again.
        </p>
      )}
    </div>
  );
}

export function ClassChangeSettingsCard({ showId }: { showId: string }) {
  const { data, isError, refetch, isFetching } = useQuery(classChangeSettingsQueryOptions(showId));
  const afterClose = useClassChangeSwitch(showId, 'afterClose', data?.afterClose);
  const sameDay = useClassChangeSwitch(showId, 'sameDay', data?.sameDay);
  // Until this show's settings are read, the switches cannot say what the show allows.
  const unknown = data === undefined;
  // Show setup is online only: offline, a tap would show a policy the server is not enforcing.
  const isOnline = useIsOnline();

  if (unknown && isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Class changes</CardTitle>
          <CardDescription>
            Couldn't load this show's class change settings. Check your connection and try again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Class changes</CardTitle>
        <CardDescription>
          Choose when exhibitors can ask to change a dog's class. Your own Change class always
          works, whatever these say.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isOnline && (
          <p className="text-sm text-muted-foreground">
            Changing these settings needs a connection.
          </p>
        )}
        <SettingSwitch
          id="allow-class-changes-after-close"
          label="Allow class change requests after entries close"
          help={
            unknown
              ? CHECKING
              : afterClose.checked
                ? 'Exhibitors can ask to change class until the show is over. You approve each request.'
                : 'Once entries close, exhibitors cannot ask to change class. They are told to ask you.'
          }
          control={afterClose}
          disabled={unknown || !isOnline}
        />
        <SettingSwitch
          id="allow-same-day-move-ups"
          label="Allow requests to move to another trial on the same day"
          help={
            unknown
              ? CHECKING
              : sameDay.checked
                ? 'Exhibitors can ask for a class in a different trial on the same day as their entry.'
                : 'Exhibitors cannot ask for a class in a different trial on the same day. A class in the same trial, or on another day, is still fine.'
          }
          control={sameDay}
          disabled={unknown || !isOnline}
        />
      </CardContent>
    </Card>
  );
}
