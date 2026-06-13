import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { submitFeedback } from '@/services/askqService';

interface AskQFeedbackProps {
  queryLogId: string | null;
}

export function AskQFeedback({ queryLogId }: AskQFeedbackProps) {
  const [submitted, setSubmitted] = useState<1 | -1 | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const handleRating = async (rating: 1 | -1) => {
    if (!queryLogId || submitted) return;
    setSubmitted(rating);
    try {
      await submitFeedback({ queryLogId, rating });
    } catch {
      // Silent failure — feedback is non-critical
    }
  };

  const handleReport = async () => {
    if (!queryLogId || !reportText.trim()) return;
    try {
      await submitFeedback({ queryLogId, reportText: reportText.trim() });
      setReportSubmitted(true);
      setShowReport(false);
    } catch {
      // Silent failure
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Was this helpful?</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => handleRating(1)}
            disabled={submitted !== null}
            aria-label="Helpful"
            className={`p-1.5 rounded-md transition-colors ${
              submitted === 1
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            } disabled:opacity-60`}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleRating(-1)}
            disabled={submitted !== null}
            aria-label="Not helpful"
            className={`p-1.5 rounded-md transition-colors ${
              submitted === -1
                ? 'bg-destructive/10 text-destructive '
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            } disabled:opacity-60`}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
        </div>
        {!reportSubmitted && (
          <button
            onClick={() => setShowReport(!showReport)}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground ml-auto transition-colors"
          >
            Report issue
          </button>
        )}
      </div>

      {showReport && (
        <div className="flex gap-2">
          <input
            type="text"
            value={reportText}
            onChange={e => setReportText(e.target.value)}
            placeholder="What went wrong?"
            className="flex-1 text-xs rounded-md bg-muted px-2.5 py-1.5 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <button
            onClick={handleReport}
            disabled={!reportText.trim()}
            className="text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
