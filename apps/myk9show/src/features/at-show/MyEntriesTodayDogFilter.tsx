/**
 * "All · each dog" filter for "Your dogs today". Rendered by the caller only
 * when two or more dogs have rows (MYK9-1046).
 */
import { Button } from '@/components/ui/button';
import { dogFilterLabel, type MyDogSummary } from './orderMyEntriesToday';

export function MyEntriesTodayDogFilter({
  dogs,
  totalCount,
  selected,
  onSelect,
}: {
  dogs: readonly MyDogSummary[];
  totalCount: number;
  /** `null` = All. */
  selected: string | null;
  onSelect: (dogKey: string | null) => void;
}) {
  return (
    <div
      className="mt-3 flex flex-wrap gap-2"
      role="group"
      aria-label="Show which dog"
      data-testid="at-show-my-entries-dog-filter"
    >
      <Button
        type="button"
        size="sm"
        variant={selected === null ? 'default' : 'outline'}
        className="min-h-11"
        aria-pressed={selected === null}
        aria-label={`All dogs, ${totalCount} ${totalCount === 1 ? 'class' : 'classes'}`}
        onClick={() => onSelect(null)}
      >
        All
      </Button>
      {dogs.map(dog => (
        <Button
          key={dog.dogKey}
          type="button"
          size="sm"
          variant={selected === dog.dogKey ? 'default' : 'outline'}
          className="min-h-11"
          aria-pressed={selected === dog.dogKey}
          aria-label={dogFilterLabel(dog)}
          onClick={() => onSelect(dog.dogKey)}
        >
          {dog.dogName}
        </Button>
      ))}
    </div>
  );
}
