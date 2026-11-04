/**
 * MYK9-1685: the "This show uses…" section of Edit show > Venue & policies. Six switches say
 * which optional tools this show runs; a secretary who never opens them gets the bare-minimum app.
 *
 * Each switch saves on its own, like the venue cards, and is NOT part of the Edit form's dirty
 * state. Switches 2-6 are columns on `shows` and ride the replicated `updateShow` path, so a flip
 * made offline queues and syncs. Switch 1 is `show_visibility_settings.self_checkin_enabled`,
 * an online-only write, so it is disabled with a reason while offline.
 *
 * Turning a tool off hides its Show Desk Actions row and deletes nothing; turning it back on
 * restores the row with its data.
 */
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { useShowStore } from '@/store/showStore';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { useShowSettings } from '@/hooks/queries/useShowSettingsDatabase';
import { useUpdateShowCheckin } from '@/hooks/mutations/useShowSettingsMutations';
import type { Show } from '@/types/show-types';

type UsesField =
  | 'usesDeviceScoring'
  | 'usesPaperPacket'
  | 'usesVolunteers'
  | 'usesLandingPage'
  | 'publishesOwnPremium';

interface ShowUsesRow {
  field: UsesField;
  label: string;
  description: string;
  /**
   * What the switch reads as before the show's row carries a value. It matches the Actions row,
   * which stays visible while the value is unknown, so a cached pre-migration show never shows an
   * "off" switch beside a visible row.
   */
  fallback: boolean;
}

const SHOW_USES_ROWS: readonly ShowUsesRow[] = [
  {
    field: 'usesDeviceScoring',
    label: 'Judges score on devices',
    description: 'Shows the Access codes row so judges and ringside can sign in on their phones.',
    fallback: true,
  },
  {
    field: 'usesPaperPacket',
    label: 'Paper fallback packet',
    description: 'Shows the Emergency trial packet row for a printed backup of the day.',
    fallback: true,
  },
  {
    field: 'usesVolunteers',
    label: 'Volunteer tracking',
    description: 'Shows the Volunteers row for helper assignments and gaps.',
    fallback: true,
  },
  {
    field: 'usesLandingPage',
    label: 'Public landing page',
    description: 'Shows the Landing page card and its reminder until the page is published.',
    fallback: false,
  },
  {
    field: 'publishesOwnPremium',
    label: 'We publish our own premium list',
    description:
      'Your club shares its premium list itself, so myK9 stops reminding you to publish one.',
    fallback: false,
  },
];

function SwitchRow({
  id,
  label,
  description,
  checked,
  disabled,
  note,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  note?: string | undefined;
  onChange: (next: boolean) => void;
}) {
  const describedBy = `${id}-desc`;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p id={describedBy} className="text-xs text-muted-foreground">
          {description}
          {note ? ` ${note}` : ''}
        </p>
      </div>
      {/* 44px tap row enlarges the hit area around the ~20px switch (PRODUCT.md touch floor). */}
      <label
        htmlFor={id}
        className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center"
      >
        <Switch
          id={id}
          aria-label={label}
          aria-describedby={describedBy}
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled ?? false}
        />
      </label>
    </div>
  );
}

export function ShowUsesSwitches({ showId }: { showId: string }) {
  const show = useShowStore(state => state.shows.find(candidate => candidate.id === showId));
  const updateShow = useShowStore(state => state.updateShow);
  const settings = useShowSettings(showId);
  const updateCheckin = useUpdateShowCheckin();
  const online = useIsOnline();

  async function setField(field: UsesField, next: boolean) {
    try {
      await updateShow(showId, { [field]: next } as Partial<Show>);
    } catch {
      toast.error("Couldn't save that change. Please try again.");
    }
  }

  function setSelfCheckin(next: boolean) {
    updateCheckin.mutate(
      { showId, enabled: next },
      {
        onSuccess: () => toast.success(`Self check-in ${next ? 'enabled' : 'disabled'} for show`),
        onError: () => toast.error('Failed to update check-in setting'),
      }
    );
  }

  const selfCheckin = settings.data?.selfCheckinEnabled;

  return (
    <section aria-labelledby="show-uses-heading" className="space-y-2">
      <h3 id="show-uses-heading" className="text-base font-semibold">
        This show uses…
      </h3>
      <p className="text-sm text-muted-foreground">
        Turn off what you do not need. Nothing is deleted; turn a tool back on any time.
      </p>
      <SwitchRow
        id="show-uses-self-checkin"
        label="Exhibitor self check-in"
        description="Shows the Self check-in row so exhibitors can check themselves in."
        checked={selfCheckin ?? true}
        disabled={selfCheckin === undefined || !online || updateCheckin.isPending}
        note={!online ? 'Needs a connection to change.' : undefined}
        onChange={setSelfCheckin}
      />
      {SHOW_USES_ROWS.map(row => (
        <SwitchRow
          key={row.field}
          id={`show-uses-${row.field}`}
          label={row.label}
          description={row.description}
          checked={show?.[row.field] ?? row.fallback}
          disabled={!show}
          onChange={next => void setField(row.field, next)}
        />
      ))}
    </section>
  );
}
