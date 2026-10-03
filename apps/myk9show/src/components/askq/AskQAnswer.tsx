import { useState } from 'react';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';
import { TERA_WORKING_COPY, TOOL_LABELS } from './askq-config';
import { TeraAvatar, TeraFace } from './TeraAvatar';

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
        <div className="flex items-start gap-2">
          <TeraAnswerMark isStreaming={isStreaming} />
          <div className="min-w-0 flex-1 bg-muted/50 px-3.5 py-3 rounded-xl rounded-tl-sm">
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
        </div>
      ) : isStreaming ? (
        <TeraWorkingIndicator />
      ) : null}
    </div>
  );
}

/**
 * The answer's sender mark. When an answer finishes streaming, Tera plays
 * "Found it" once (MYK9-851), then settles on her static face. It never delays
 * the text, which has already landed; reduced motion keeps the face.
 */
function TeraAnswerMark({ isStreaming }: { isStreaming: boolean }) {
  const reducedMotion = useReducedMotion();
  const [wasStreaming, setWasStreaming] = useState(isStreaming);
  const [foundIt, setFoundIt] = useState(false);
  if (wasStreaming !== isStreaming) {
    setWasStreaming(isStreaming);
    setFoundIt(wasStreaming && !isStreaming);
  }

  if (foundIt && !reducedMotion) {
    return (
      <span data-testid="tera-found-it" className="flex-none">
        <TeraAvatar state="found-it" size={40} onEnded={() => setFoundIt(false)} />
      </span>
    );
  }
  return <TeraFace />;
}

/** Tera's working state, shared by every AskQ surface that shows a loading state. */
export function TeraWorkingIndicator() {
  return (
    <div
      role="status"
      aria-label={TERA_WORKING_COPY}
      className="flex items-center gap-3 rounded-xl rounded-tl-sm border border-border/60 bg-muted/45 px-3.5 py-3"
    >
      <TeraAvatar state="working" />
      <p className="text-sm text-muted-foreground">{TERA_WORKING_COPY}</p>
    </div>
  );
}
