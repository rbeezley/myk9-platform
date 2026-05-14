import { useState, useCallback, useRef, type FormEvent } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Dog, User, ClipboardList } from 'lucide-react';
import { useArmbandLookup } from '@/hooks/queries/useArmbandLookup';
import { Link } from 'react-router-dom';

/** Display labels for entry_status DB values */
const ENTRY_STATUS_LABEL: Record<string, string> = {
  'no-status': 'No Status',
  draft: 'Draft',
  submitted: 'Submitted',
  paid: 'Paid',
  confirmed: 'Confirmed',
  'checked-in': 'Checked In',
  competing: 'Competing',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
  scratched: 'Pulled',
  absent: 'Absent',
};

function formatEntryStatus(status: string | null): string {
  if (!status) return 'Registered';
  return ENTRY_STATUS_LABEL[status] ?? status;
}

interface ArmbandLookupProps {
  showId: string;
}

export function ArmbandLookup({ showId }: ArmbandLookupProps) {
  const [inputValue, setInputValue] = useState('');
  const [searchNumber, setSearchNumber] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useArmbandLookup(showId, searchNumber);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed) return;
      setSearchNumber(trimmed);
      setIsOpen(true);
    },
    [inputValue]
  );

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    // Keep input value when closing for quick re-search
  }, []);

  const handleInputFocus = useCallback(() => {
    inputRef.current?.select();
  }, []);

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            placeholder="Armband #"
            aria-label="Look up exhibitor by armband number"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onFocus={handleInputFocus}
            className="w-[120px] h-9 pl-8 pr-8 text-sm"
          />
          {isLoading && (
            <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </form>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="end">
        {isLoading && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Looking up...
          </div>
        )}

        {isError && <div className="p-4 text-sm text-destructive">Lookup failed — try again</div>}

        {!isLoading && !isError && !data && searchNumber && (
          <div className="p-4 text-sm text-muted-foreground">
            No dog found with armband #{searchNumber}
          </div>
        )}

        {!isLoading && !isError && data && (
          <div>
            {/* Dog info section */}
            <div className="border-b p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Dog className="h-4 w-4 text-muted-foreground" />
                  <span className="font-bold text-sm">{data.dog.name}</span>
                </div>
                <Badge variant="secondary" className="text-xs font-mono">
                  #{data.armband_number}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {data.dog.breed} &middot; {data.dog.sex}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                {data.owner.first_name} {data.owner.last_name}
              </div>
              <Link
                to={`/dogs/${data.dog.id}`}
                className="inline-block text-xs text-primary hover:underline mt-1"
              >
                View full profile →
              </Link>
            </div>

            {/* Entries section */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                Entries at this show ({data.entries.length})
              </div>
              {data.entries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No entries found</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {data.entries.map(entry => (
                    <div key={entry.id} className="py-1.5 px-2 rounded bg-muted/30 text-sm">
                      <div className="flex items-center justify-between">
                        <span>
                          {entry.class_name}
                          {entry.class_level ? ` · ${entry.class_level}` : ''}
                        </span>
                        <Badge variant="outline" className="text-[10px] ml-2 shrink-0">
                          {formatEntryStatus(entry.entry_status)}
                        </Badge>
                      </div>
                      {entry.handler && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Handler: {entry.handler}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
