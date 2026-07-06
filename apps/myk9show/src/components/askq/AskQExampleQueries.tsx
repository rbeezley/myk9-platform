import { EXAMPLE_QUERIES, CATEGORY_LABELS, type ExampleQuery } from './askq-config';

interface AskQExampleQueriesProps {
  onSelectQuery: (query: string, category: ExampleQuery['category']) => void;
  category?: ExampleQuery['category'];
}

const CATEGORIES: ExampleQuery['category'][] = ['rules', 'show-data', 'app-help'];

export function AskQExampleQueries({ onSelectQuery, category }: AskQExampleQueriesProps) {
  const categories = category ? [category] : CATEGORIES;

  return (
    <div className="space-y-4">
      {categories.map(currentCategory => {
        const queries = EXAMPLE_QUERIES.filter(q => q.category === currentCategory);

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
