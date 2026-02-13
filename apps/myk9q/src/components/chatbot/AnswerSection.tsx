import React from 'react';
import {
  Loader2,
  AlertCircle,
  Flag,
  Check,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Database,
} from 'lucide-react';
import { formatToolName, type ChatResponse } from '../../services/chatbotService';

export interface AnswerSectionProps {
  response: ChatResponse;
  feedbackStatus: 'idle' | 'submitting' | 'success' | 'error';
  ratingStatus: 'idle' | 'submitting' | 'submitted';
  submittedRating: number | null;
  onReportIssue: () => void;
  onRate: (rating: number) => void;
}

export const AnswerSection: React.FC<AnswerSectionProps> = ({
  response,
  feedbackStatus,
  ratingStatus,
  submittedRating,
  onReportIssue,
  onRate,
}) => (
  <div className="chat-answer-section">
    <div className="chat-answer-header">
      <div className="chat-answer-label">Answer</div>
      <div className="chat-answer-badges">
        {response.source && (
          <span className={`chat-source-badge ${response.source}`}>
            {response.source === 'faq' ? (
              <>
                <Database size={12} />
                <span>FAQ</span>
              </>
            ) : (
              <>
                <Sparkles size={12} />
                <span>AI</span>
              </>
            )}
          </span>
        )}
        {response.toolsUsed && response.toolsUsed.length > 0 && (
          <div className="chat-tools-used">
            {response.toolsUsed.map((tool, idx) => (
              <span key={idx} className={`chat-tool-badge ${tool}`}>
                {formatToolName(tool)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
    <div className="chat-answer-text">{response.answer}</div>

    <div className="chat-feedback-row">
      <div className="chat-rating-section">
        <span className="chat-rating-label">Was this helpful?</span>
        <div className="chat-rating-buttons">
          <button
            onClick={() => onRate(5)}
            className={`chat-rating-btn thumbs-up ${submittedRating === 5 ? 'selected' : ''}`}
            disabled={ratingStatus !== 'idle'}
            title="Helpful"
            aria-label="Rate as helpful"
          >
            <ThumbsUp size={16} />
          </button>
          <button
            onClick={() => onRate(1)}
            className={`chat-rating-btn thumbs-down ${submittedRating === 1 ? 'selected' : ''}`}
            disabled={ratingStatus !== 'idle'}
            title="Not helpful"
            aria-label="Rate as not helpful"
          >
            <ThumbsDown size={16} />
          </button>
          {ratingStatus === 'submitted' && (
            <span className="chat-rating-thanks">Thanks!</span>
          )}
        </div>
      </div>

      <button
        onClick={onReportIssue}
        className={`chat-report-issue-btn ${feedbackStatus === 'success' ? 'success' : ''}`}
        title={feedbackStatus === 'success' ? 'Issue reported' : 'Report an incorrect answer'}
        disabled={feedbackStatus === 'submitting' || feedbackStatus === 'success'}
      >
        {feedbackStatus === 'submitting' ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            <span>Reporting...</span>
          </>
        ) : feedbackStatus === 'success' ? (
          <>
            <Check size={14} />
            <span>Reported</span>
          </>
        ) : feedbackStatus === 'error' ? (
          <>
            <AlertCircle size={14} />
            <span>Failed</span>
          </>
        ) : (
          <>
            <Flag size={14} />
            <span>Report</span>
          </>
        )}
      </button>
    </div>
  </div>
);
