import {
  EXAMPLE_QUERIES,
  STAFF_EXAMPLE_QUERIES,
  CATEGORY_LABELS,
  type ExampleQuery,
} from './askq-config';

interface AskQExampleQueriesProps {
  onSelectQuery: (query: string, category: ExampleQuery['category']) => void;
  category?: ExampleQuery['category'];
  /** Staff get how-to suggestions; exhibitor questions (my dog, my results) do not fit them. */
  isStaff?: boolean;
}

const CATEGORIES: ExampleQuery['category'][] = ['rules', 'show-data', 'app-help'];

export function AskQExampleQueries({
  onSelectQuery,
  category,
  isStaff = false,
}: AskQExampleQueriesProps) {
  const categories = isStaff ? CATEGORIES.slice(2) : category ? [category] : CATEGORIES;
  const source = isStaff ? STAFF_EXAMPLE_QUERIES : EXAMPLE_QUERIES;

  return (
    <div className="space-y-4">
      {categories.map(currentCategory => {
        const queries = source.filter(q => q.category === currentCategory);

        return (
          <div key={currentCategory}>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              {CATEGORY_LABELS[currentCategory]}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {queries.length === 0 ? (
                <span className="px-3 py-1.5 rounded-full text-xs bg-muted/50 text-muted-foreground/50">
                  Coming soon...
                </span>
              ) : (
                queries.map(query => (
                  <button
                    key={query.text}
                    onClick={() => onSelectQuery(query.text, query.category)}
                    className="px-3 py-1.5 rounded-full text-xs bg-muted hover:bg-muted/80 text-muted-foreground transition-colors cursor-pointer text-left"
                  >
                    {query.text}
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
