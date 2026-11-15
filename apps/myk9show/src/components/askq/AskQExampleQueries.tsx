import { EXAMPLE_QUERIES, STAFF_EXAMPLE_QUERIES } from './askq-config';

interface AskQExampleQueriesProps {
  onSelectQuery: (query: string) => void;
  /** Staff get how-to suggestions; exhibitor questions (my dog, my results) do not fit them. */
  isStaff?: boolean;
}

export function AskQExampleQueries({ onSelectQuery, isStaff = false }: AskQExampleQueriesProps) {
  const queries = isStaff ? STAFF_EXAMPLE_QUERIES : EXAMPLE_QUERIES;

  return (
    <div className="flex flex-wrap gap-1.5">
      {queries.map(query => (
        <button
          key={query}
          onClick={() => onSelectQuery(query)}
          className="px-3 py-1.5 rounded-full text-xs bg-muted hover:bg-muted/80 text-muted-foreground transition-colors cursor-pointer text-left"
        >
          {query}
        </button>
      ))}
    </div>
  );
}
