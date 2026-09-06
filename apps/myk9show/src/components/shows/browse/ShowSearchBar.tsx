import { useState, type FormEvent } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchBar } from '@/components/common/SearchBar';
import type { ViewerLocation } from '@/features/location/viewerLocation';

export interface ShowSearchBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  location: ViewerLocation | null;
  isResolvingLocation?: boolean;
  onChooseTyped: (query: string) => Promise<boolean>;
  onUseDeviceLocation: () => Promise<boolean>;
  onChooseAnywhere: () => void;
  className?: string;
}

/**
 * The Find Shows search row: free text plus a "Near" field.
 *
 * The Near field is a popover, not a second text box, because most visitors
 * never type into it — it opens already filled from the profile or the
 * connection, and "approximate" tells a signed-out visitor where that guess
 * came from. Device location is requested only from the button inside.
 */
export function ShowSearchBar({
  search,
  onSearchChange,
  searchPlaceholder,
  location,
  isResolvingLocation = false,
  onChooseTyped,
  onUseDeviceLocation,
  onChooseAnywhere,
  className,
}: ShowSearchBarProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<'typed' | 'device' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const label = location ? location.label : isResolvingLocation ? 'Finding you…' : 'Anywhere';

  const submitTyped = async (event: FormEvent) => {
    event.preventDefault();
    if (!typed.trim()) return;
    setBusy('typed');
    setError(null);
    const ok = await onChooseTyped(typed);
    setBusy(null);
    if (ok) {
      setTyped('');
      setOpen(false);
    } else {
      setError("We couldn't find that place. Try a city and state, or a ZIP code.");
    }
  };

  const useDevice = async () => {
    setBusy('device');
    setError(null);
    const ok = await onUseDeviceLocation();
    setBusy(null);
    if (ok) setOpen(false);
    else setError("Your browser didn't share a location. You can type a city instead.");
  };

  return (
    <div
      className={cn('flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center', className)}
    >
      <SearchBar
        size="sm"
        value={search}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        className="w-full shrink-0 sm:w-52"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild nativeButton>
          <button
            type="button"
            aria-label={`Near: ${label}`}
            data-testid="near-field"
            className="inline-flex h-11 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm shadow-card transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:max-w-[16rem]"
          >
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">Near</span>
            <span className="truncate font-medium text-foreground">{label}</span>
            {location?.source === 'ip' && (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">approximate</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3 rounded-xl p-3">
          <form onSubmit={submitTyped} className="space-y-2">
            <label htmlFor="near-typed" className="text-sm font-medium text-foreground">
              Show me shows near
            </label>
            <div className="flex gap-2">
              <input
                id="near-typed"
                type="text"
                value={typed}
                onChange={event => setTyped(event.target.value)}
                placeholder="City, state or ZIP"
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button type="submit" size="default" disabled={busy !== null || !typed.trim()}>
                {busy === 'typed' ? 'Looking…' : 'Go'}
              </Button>
            </div>
          </form>
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              className="justify-start"
              onClick={useDevice}
              disabled={busy !== null}
            >
              <LocateFixed className="mr-2 h-4 w-4" aria-hidden="true" />
              {busy === 'device' ? 'Locating…' : 'Use my location'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="justify-start"
              onClick={() => {
                onChooseAnywhere();
                setError(null);
                setOpen(false);
              }}
              disabled={!location}
            >
              Anywhere
            </Button>
          </div>
          {location?.source === 'ip' && (
            <p className="text-xs text-muted-foreground">
              Guessed from your connection, so it can be a city or two off.
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default ShowSearchBar;
