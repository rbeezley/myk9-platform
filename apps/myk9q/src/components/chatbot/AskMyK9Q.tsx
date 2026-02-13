import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  MessageSquare,
  Loader2,
  AlertCircle,
  BookOpen,
  LayoutGrid,
  HelpCircle,
} from 'lucide-react';
import {
  ChatbotService,
  ChatServiceError,
  getPopularQuestions,
  type ChatResponse,
  type PopularQuestion,
} from '../../services/chatbotService';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { logger } from '@/utils/logger';
import { getFAQCount } from '@/services/faq';
import {
  type SourceType,
  parseOrgAndSport,
  categorizePopularQuestions,
  FALLBACK_QUERIES,
} from './chatbotUtils';
import { AnswerSection } from './AnswerSection';
import { SourcesSection } from './SourcesSection';
import { ChatInputFooter } from './ChatInputFooter';
import './AskMyK9Q.css';

interface AskMyK9QProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AskMyK9Q: React.FC<AskMyK9QProps> = ({ isOpen, onClose }) => {
  const { showContext } = useAuth();
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<SourceType | null>(null);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [_isOnline, setIsOnline] = useState(navigator.onLine);
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [ratingStatus, setRatingStatus] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const [submittedRating, setSubmittedRating] = useState<number | null>(null);
  const [isFAQExpanded, setIsFAQExpanded] = useState(false);
  const [popularQuestions, setPopularQuestions] = useState<PopularQuestion[]>([]);
  const [faqCount, setFaqCount] = useState<number>(0);

  // Load FAQ count (async since it's from IndexedDB/Supabase)
  useEffect(() => {
    getFAQCount().then(setFaqCount).catch(() => setFaqCount(0));
  }, []);

  const { organizationCode, sportCode } = showContext?.org
    ? parseOrgAndSport(showContext.org)
    : { organizationCode: 'AKC', sportCode: 'scent-work' };

  const handleSearch = useCallback(async (searchQuery: string) => {
    setFeedbackStatus('idle');
    setRatingStatus('idle');
    setSubmittedRating(null);

    if (!searchQuery.trim()) {
      return;
    }

    if (!navigator.onLine) {
      setError('AskQ requires an internet connection. Browse FAQs below for offline help.');
      setResponse(null);
      return;
    }

    if (!showContext?.licenseKey) {
      setError('Please log in to use AskQ.');
      setResponse(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setExpandedSource(null);
    setExpandedRuleId(null);
    setIsFAQExpanded(false);

    const startTime = Date.now();

    try {
      const result = await ChatbotService.sendMessage({
        message: searchQuery,
        licenseKey: showContext.licenseKey,
        organizationCode,
        sportCode,
      });

      // Minimum loading time for visual feedback
      const elapsed = Date.now() - startTime;
      if (elapsed < 500) {
        await new Promise(resolve => setTimeout(resolve, 500 - elapsed));
      }

      setResponse(result);

      // Auto-expand first source type if available
      if (result.sources) {
        const firstSource = Object.keys(result.sources)[0] as SourceType | undefined;
        if (firstSource) {
          setExpandedSource(firstSource);
        }
      }
    } catch (err) {
      logger.error('[AskMyK9Q] Search error:', err);
      const chatError = err as ChatServiceError;
      setError(chatError.message || 'Failed to get response. Please try again.');
      setResponse(null);
    } finally {
      setIsLoading(false);
    }
  }, [showContext?.licenseKey, organizationCode, sportCode]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleSearchClick = () => {
    handleSearch(query);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch(query);
    }
  };

  const handleFAQAskAI = (question: string) => {
    setQuery(question);
    handleSearch(question);
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
    handleSearch(example);
  };

  const handleClearResult = () => {
    setQuery('');
    setResponse(null);
    setError(null);
  };

  const toggleSourceExpansion = (sourceType: SourceType) => {
    setExpandedSource(expandedSource === sourceType ? null : sourceType);
  };

  const toggleRuleExpansion = (ruleId: string) => {
    setExpandedRuleId(expandedRuleId === ruleId ? null : ruleId);
  };

  const handleReportIssue = async () => {
    if (feedbackStatus === 'submitting' || feedbackStatus === 'success') return;

    setFeedbackStatus('submitting');

    try {
      const { error: insertError } = await supabase
        .from('chatbot_feedback')
        .insert({
          question: query,
          ai_response: response?.answer || '',
          tools_used: response?.toolsUsed || [],
          show_id: showContext?.showId ? parseInt(showContext.showId, 10) : null,
          license_key: showContext?.licenseKey || null,
        });

      if (insertError) {
        // If table doesn't exist, fall back to rules_feedback table
        if (insertError.code === '42P01') {
          const { error: fallbackError } = await supabase
            .from('rules_feedback')
            .insert({
              question: query,
              ai_response: response?.answer || '',
              show_id: showContext?.showId ? parseInt(showContext.showId, 10) : null,
              license_key: showContext?.licenseKey || null,
            });

          if (fallbackError) {
            logger.error('Failed to submit feedback:', fallbackError);
            setFeedbackStatus('error');
            setTimeout(() => setFeedbackStatus('idle'), 3000);
            return;
          }
        } else {
          logger.error('Failed to submit feedback:', insertError);
          setFeedbackStatus('error');
          setTimeout(() => setFeedbackStatus('idle'), 3000);
          return;
        }
      }

      setFeedbackStatus('success');
    } catch (err) {
      logger.error('Failed to submit feedback:', err);
      setFeedbackStatus('error');
      setTimeout(() => setFeedbackStatus('idle'), 3000);
    }
  };

  const handleRating = async (rating: number) => {
    if (ratingStatus !== 'idle' || !response?.logId) {
      if (!response?.logId) {
        logger.log('[AskMyK9Q] No logId available for rating');
      }
      return;
    }

    setRatingStatus('submitting');
    setSubmittedRating(rating);

    try {
      const success = await ChatbotService.submitRating(response.logId, rating);
      if (success) {
        setRatingStatus('submitted');
      } else {
        setRatingStatus('idle');
        setSubmittedRating(null);
      }
    } catch (err) {
      logger.error('[AskMyK9Q] Rating submission error:', err);
      setRatingStatus('idle');
      setSubmittedRating(null);
    }
  };

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setError(null);
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (query.trim()) {
        setError('AskQ requires an internet connection. Your show data is still available offline in the app.');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [query]);

  // Fetch popular questions when panel opens
  useEffect(() => {
    if (isOpen && navigator.onLine) {
      getPopularQuestions(12)
        .then(setPopularQuestions)
        .catch((err) => {
          logger.error('[AskMyK9Q] Failed to fetch popular questions:', err);
        });
    }
  }, [isOpen]);

  // Clear state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResponse(null);
      setError(null);
      setIsFAQExpanded(false);
      setExpandedSource(null);
      setExpandedRuleId(null);
      setFeedbackStatus('idle');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const hasResult = response?.answer || error;

  const categorized = popularQuestions.length > 0
    ? categorizePopularQuestions(popularQuestions)
    : { rules: [], showData: [] };

  const rulesQueries = categorized.rules.length > 0
    ? categorized.rules
    : FALLBACK_QUERIES.rules;
  const showDataQueries = categorized.showData.length > 0
    ? categorized.showData
    : FALLBACK_QUERIES.showData;

  const rulesLabel = categorized.rules.length > 0 ? '🔥 Rules' : '📖 Rules';
  const showDataLabel = categorized.showData.length > 0 ? '🔥 Your Show' : '📊 Your Show';

  return (
    <>
      <div
        className="chat-panel-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className="chat-panel chat-panel-traditional"
        role="complementary"
        aria-label="AskQ"
      >
        <div className="chat-panel-header">
          <div className="chat-panel-title-section">
            <div className="chat-panel-title">
              <MessageSquare size={24} />
              <h2>AskQ</h2>
            </div>
            <p className="chat-header-disclaimer">Always verify crucial information with official sources.</p>
          </div>
          <button
            onClick={onClose}
            className="chat-close-btn"
            aria-label="Close assistant"
          >
            <X size={24} />
          </button>
        </div>

        <div className="chat-content-area">
          {isLoading && (
            <div className="chat-loading-state">
              <Loader2 className="animate-spin" size={32} />
              <p>Searching...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="chat-error-state">
              <AlertCircle size={24} />
              <p>{error}</p>
              <button
                className="chat-try-again-btn"
                onClick={handleClearResult}
              >
                Try another question
              </button>
            </div>
          )}

          {!isLoading && response?.answer && (
            <>
              <AnswerSection
                response={response}
                feedbackStatus={feedbackStatus}
                ratingStatus={ratingStatus}
                submittedRating={submittedRating}
                onReportIssue={handleReportIssue}
                onRate={handleRating}
              />

              {response.sources && Object.keys(response.sources).length > 0 && (
                <SourcesSection
                  sources={response.sources}
                  expandedSource={expandedSource}
                  expandedRuleId={expandedRuleId}
                  onToggleSource={toggleSourceExpansion}
                  onToggleRule={toggleRuleExpansion}
                />
              )}

              <div className="chat-ask-another">
                <button
                  className="chat-ask-another-btn"
                  onClick={handleClearResult}
                >
                  Ask another question
                </button>
              </div>
            </>
          )}

          {!isLoading && !hasResult && (
            <div className="chat-welcome-state">
              <MessageSquare size={48} opacity={0.3} />
              <p>Ask me anything about:</p>
              <ul className="chat-capabilities-list">
                <li><BookOpen size={16} /> <strong>Rules & Regulations</strong> – time limits, penalties, requirements</li>
                <li><LayoutGrid size={16} /> <strong>Show Information</strong> – results, placements, who qualified, fastest times</li>
                <li><HelpCircle size={16} /> <strong>App Help</strong> – how to check in, score, use features</li>
              </ul>
            </div>
          )}
        </div>

        <ChatInputFooter
          query={query}
          isLoading={isLoading}
          hasResult={!!hasResult}
          isFAQExpanded={isFAQExpanded}
          faqCount={faqCount}
          rulesQueries={rulesQueries}
          showDataQueries={showDataQueries}
          rulesLabel={rulesLabel}
          showDataLabel={showDataLabel}
          onQueryChange={handleQueryChange}
          onKeyPress={handleKeyPress}
          onSearchClick={handleSearchClick}
          onExampleClick={handleExampleClick}
          onFAQAskAI={handleFAQAskAI}
          onToggleFAQ={() => setIsFAQExpanded(!isFAQExpanded)}
        />
      </aside>
    </>
  );
};

export default AskMyK9Q;
