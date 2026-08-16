import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchPlaceDetails,
  fetchPlaceSuggestions,
  formatVenueLocation,
  isPlacesAutocompleteConfigured,
  newPlacesSessionToken,
  type PlaceSuggestion,
} from './placesAutocomplete';

const MIN_QUERY_LENGTH = 3;
const DEFAULT_DEBOUNCE_MS = 300;

export interface VenuePlaceSelection {
  location: string;
  lat: number;
  lng: number;
}

interface VenueAddressAutocompleteProps {
  id: string;
  value: string;
  /** Fires on every keystroke, exactly like the plain textarea it replaces. */
  onChange: (location: string) => void;
  /** Fires when a suggestion resolves to an address with coordinates. */
  onPlaceSelected: (selection: VenuePlaceSelection) => void;
  placeholder?: string;
  rows?: number;
}

/**
 * Venue address field with Google Places Autocomplete as a progressive
 * enhancement. Without VITE_GOOGLE_MAPS_API_KEY this renders the plain
 * textarea unchanged (Nominatim "Locate" on the pin map still works).
 *
 * Suggestions render IN FLOW below the field, not absolutely positioned —
 * an anchored popup here would re-create the bottom-of-viewport overflow
 * the noHandRolledDropdowns architecture test exists to prevent.
 */
export function VenueAddressAutocomplete({
  id,
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  rows = 3,
}: VenueAddressAutocompleteProps) {
  const configured = isPlacesAutocompleteConfigured();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // One token spans typing → selection so Google bills a single session.
  const sessionTokenRef = useRef<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  }, []);

  useEffect(
    () => () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    },
    []
  );

  const handleInput = (nextValue: string) => {
    onChange(nextValue);
    if (!configured) return;

    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    const query = nextValue.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      close();
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      sessionTokenRef.current ??= newPlacesSessionToken();
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const results = await fetchPlaceSuggestions(
        query,
        sessionTokenRef.current,
        controller.signal
      );
      if (controller.signal.aborted) return;
      setSuggestions(results);
      setOpen(results.length > 0);
      setActiveIndex(-1);
    }, DEFAULT_DEBOUNCE_MS);
  };

  const handleSelect = async (suggestion: PlaceSuggestion) => {
    const token = sessionTokenRef.current;
    // The details call consumes the session; the next keystroke mints a new one.
    sessionTokenRef.current = null;
    close();

    const details = token ? await fetchPlaceDetails(suggestion.placeId, token) : null;
    if (details) {
      onPlaceSelected({ location: formatVenueLocation(details), lat: details.lat, lng: details.lng });
    } else {
      // Details lookup failed — keep the chosen text; the secretary can still
      // place the pin via the map's Locate button.
      onChange(suggestion.text || suggestion.mainText);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(prev => (prev + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(prev => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      void handleSelect(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      close();
    }
  };

  return (
    <div>
      <Textarea
        id={id}
        value={value}
        onChange={e => handleInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={close}
        placeholder={placeholder}
        rows={rows}
        className="border border-border bg-input rounded-md"
        role={configured ? 'combobox' : undefined}
        aria-expanded={configured ? open : undefined}
        aria-controls={configured ? listId : undefined}
        aria-autocomplete={configured ? 'list' : undefined}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Venue suggestions"
          className="mt-1 max-h-60 overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.placeId} role="presentation">
              <button
                type="button"
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // mousedown fires before the textarea's blur; preventing default
                // keeps focus (and the list) alive long enough for the click.
                onMouseDown={e => e.preventDefault()}
                onClick={() => void handleSelect(suggestion)}
                className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                  index === activeIndex ? 'bg-accent' : ''
                }`}
              >
                <span className="block font-medium">{suggestion.mainText}</span>
                {suggestion.secondaryText && (
                  <span className="block text-muted-foreground">{suggestion.secondaryText}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
