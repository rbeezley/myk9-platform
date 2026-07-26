import { Suspense, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Loader2 } from 'lucide-react';
import { useShowStore } from '@/store/showStore';
import type { VenuePinValue } from '@/features/maps/VenuePinMap';
import { VenuePinMap } from '@/components/common/LazyComponents';

function pinEquals(a: VenuePinValue | null, b: VenuePinValue | null): boolean {
  if (a === null || b === null) return a === b;
  return a.lat === b.lat && a.lng === b.lng;
}

interface VenueLocationCardProps {
  showId: string;
}

/**
 * Show Settings card for confirming the venue map pin on an existing show.
 * Shows created before the map feature (or with a skipped pin) gain
 * coordinates here and start appearing in the Find Shows map view.
 */
export function VenueLocationCard({ showId }: VenueLocationCardProps) {
  const { shows, updateShow } = useShowStore();
  const show = shows.find(s => s.id === showId) ?? null;

  const savedPin: VenuePinValue | null =
    show?.latitude != null && show?.longitude != null
      ? { lat: show.latitude, lng: show.longitude }
      : null;

  // base tracks the store's pin; when the store changes (async hydration,
  // remote sync), adopt it unless the secretary has diverged from the old base.
  // Adjust-during-render, per the no-setState-in-effect rule.
  const [pinState, setPinState] = useState<{
    base: VenuePinValue | null;
    pin: VenuePinValue | null;
  }>({ base: savedPin, pin: savedPin });
  if (!pinEquals(pinState.base, savedPin)) {
    setPinState({
      base: savedPin,
      pin: pinEquals(pinState.pin, pinState.base) ? savedPin : pinState.pin,
    });
  }
  const pin = pinState.pin;

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // In-flight guard: isSaving state lags a fast double-click.
  const inFlightRef = useRef(false);

  if (!show) return null;

  const isDirty = pin !== null && !pinEquals(pin, savedPin);

  const handleSave = async () => {
    if (!pin || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateShow(showId, { latitude: pin.lat, longitude: pin.lng });
    } catch {
      setSaveError("Couldn't save the pin — check your connection and try again.");
    } finally {
      inFlightRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle>Venue Map Pin</CardTitle>
            <CardDescription>
              {savedPin
                ? 'Pin confirmed — this show appears on the Find Shows map.'
                : 'Place a pin so exhibitors can find this show on the map.'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Suspense fallback={<Skeleton className="h-[280px] w-full rounded-lg" />}>
          <VenuePinMap
            address={show.location || ''}
            value={pin}
            onChange={next => setPinState(prev => ({ ...prev, pin: next }))}
          />
        </Suspense>
        {saveError && (
          <p className="text-sm text-destructive" role="alert">
            {saveError}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save pin
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
