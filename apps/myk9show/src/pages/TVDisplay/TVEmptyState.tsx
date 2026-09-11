import { Link } from 'react-router-dom';

interface TVEmptyStateProps {
  showName?: string | undefined;
  showId?: string | undefined;
  error?: Error | null | undefined;
}

export function TVEmptyState({ showName = 'this show', showId, error }: TVEmptyStateProps) {
  const hasError = Boolean(error);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center text-zinc-500">
      <div className="text-lg text-zinc-300">
        {hasError ? 'TV board data unavailable' : 'No classes currently in progress'}
      </div>
      <p className="max-w-md text-sm">
        {hasError
          ? `We couldn't refresh ${showName}'s board data. The board will keep trying.`
          : `There are no active classes running for ${showName}.`}
      </p>
      {showId && (
        <Link
          to={`/shows/${showId}`}
          className="inline-flex min-h-11 items-center rounded-md border border-zinc-700 px-4 text-sm text-zinc-200 hover:border-zinc-500 hover:text-white"
        >
          View show details
        </Link>
      )}
    </div>
  );
}
