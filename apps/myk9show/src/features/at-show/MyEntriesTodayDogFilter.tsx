/**
 * "All · each dog" filter for "Your dogs today". Rendered by the caller only
 * when two or more dogs have rows (MYK9-1046).
 */
import { Button } from '@/components/ui/button';
import { countLabel } from '@/utils/pluralize';
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
  const options = [
    { key: null, text: 'All', label: `All dogs, ${countLabel(totalCount, 'class', 'classes')}` },
    ...dogs.map(dog => ({ key: dog.dogKey, text: dog.dogName, label: dogFilterLabel(dog) })),
  ];
  return (
    <div
      className="mt-3 flex flex-wrap gap-2"
      role="group"
      aria-label="Show which dog"
      data-testid="at-show-my-entries-dog-filter"
    >
      {options.map(option => (
        <Button
          key={option.key ?? 'all'}
          type="button"
          size="sm"
          variant={selected === option.key ? 'default' : 'outline'}
          className="min-h-11"
          aria-pressed={selected === option.key}
          aria-label={option.label}
          onClick={() => onSelect(option.key)}
        >
          {option.text}
        </Button>
      ))}
    </div>
  );
}
