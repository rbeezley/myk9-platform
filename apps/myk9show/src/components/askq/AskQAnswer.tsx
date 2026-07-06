import { TOOL_LABELS } from './askq-config';

interface AskQAnswerProps {
  query: string;
  answer: string;
  toolsUsed: string[];
  isStreaming: boolean;
}

export function AskQAnswer({ query, answer, toolsUsed, isStreaming }: AskQAnswerProps) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground px-3.5 py-2.5 rounded-xl rounded-br-sm text-sm max-w-[85%]">
          {query}
        </div>
      </div>

      {answer ? (
        <div className="bg-muted/50 px-3.5 py-3 rounded-xl rounded-tl-sm">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {answer}
            {isStreaming && (
              <span
                data-testid="streaming-cursor"
                className="inline-block w-1.5 h-4 bg-foreground/70 ml-0.5 animate-pulse align-text-bottom"
              />
            )}
          </p>

          {toolsUsed.length > 0 && (
            <div className="flex gap-1.5 mt-3">
              {toolsUsed.map(tool => (
                <span
                  key={tool}
                  className="px-2 py-0.5 rounded-full text-[11px] bg-muted text-muted-foreground"
                >
                  {TOOL_LABELS[tool] ?? tool}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : isStreaming ? (
        <AskQAnswerSkeleton />
      ) : null}
    </div>
  );
}

export function AskQAnswerSkeleton() {
  return (
    <div
      role="status"
      aria-label="AskQ is answering"
      data-testid="answer-skeleton"
      className="rounded-xl rounded-tl-sm border border-border/60 bg-muted/45 px-3.5 py-3"
    >
      <div className="space-y-2.5 animate-pulse">
        <div className="h-3 w-24 rounded-full bg-muted-foreground/20" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-muted-foreground/15" />
          <div className="h-3 w-5/6 rounded bg-muted-foreground/15" />
          <div className="h-3 w-2/3 rounded bg-muted-foreground/15" />
        </div>
      </div>
    </div>
  );
}
