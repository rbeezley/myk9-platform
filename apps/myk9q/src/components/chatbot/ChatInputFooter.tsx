import React from 'react';
import {
  Search,
  Loader2,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { FAQSection } from './FAQSection';

export interface ChatInputFooterProps {
  query: string;
  isLoading: boolean;
  hasResult: boolean;
  isFAQExpanded: boolean;
  faqCount: number;
  rulesQueries: string[];
  showDataQueries: string[];
  rulesLabel: string;
  showDataLabel: string;
  onQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSearchClick: () => void;
  onExampleClick: (example: string) => void;
  onFAQAskAI: (question: string) => void;
  onToggleFAQ: () => void;
}

export const ChatInputFooter: React.FC<ChatInputFooterProps> = ({
  query,
  isLoading,
  hasResult,
  isFAQExpanded,
  faqCount,
  rulesQueries,
  showDataQueries,
  rulesLabel,
  showDataLabel,
  onQueryChange,
  onKeyPress,
  onSearchClick,
  onExampleClick,
  onFAQAskAI,
  onToggleFAQ,
}) => (
  <div className="chat-input-footer">
    <div className="chat-faq-collapsible">
      <button
        className={`chat-faq-toggle ${isFAQExpanded ? 'expanded' : ''}`}
        onClick={onToggleFAQ}
        aria-expanded={isFAQExpanded}
      >
        <div className="chat-faq-toggle-title">
          <BookOpen size={18} />
          <span>Browse FAQs</span>
          <span className="chat-faq-count">({faqCount} offline answers)</span>
        </div>
        {isFAQExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {isFAQExpanded && (
        <div className="chat-faq-content">
          <FAQSection onAskAI={onFAQAskAI} />
        </div>
      )}
    </div>

    {!hasResult && !isLoading && (
      <div className="chat-examples">
        <div className="chat-examples-group">
          <span className="chat-examples-label">{rulesLabel}</span>
          <div className="chat-example-chips">
            {rulesQueries.map((example) => (
              <button
                key={example}
                className="chat-example-chip"
                onClick={() => onExampleClick(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
        <div className="chat-examples-group">
          <span className="chat-examples-label">{showDataLabel}</span>
          <div className="chat-example-chips">
            {showDataQueries.map((example) => (
              <button
                key={example}
                className="chat-example-chip"
                onClick={() => onExampleClick(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    )}

    <div className="chat-search-section">
      <div className="chat-search-container">
        <div className="chat-search-input-wrapper">
          <Search className="chat-search-icon" size={18} />
          <input
            type="text"
            className="chat-search-input"
            placeholder="Ask about rules or your show data..."
            value={query}
            onChange={onQueryChange}
            onKeyPress={onKeyPress}
            autoFocus
          />
          {isLoading && (
            <Loader2 className="chat-loading-icon animate-spin" size={18} />
          )}
        </div>
        <button
          onClick={onSearchClick}
          className="chat-search-btn"
          disabled={!query.trim() || isLoading}
        >
          Ask
        </button>
      </div>
    </div>
  </div>
);
