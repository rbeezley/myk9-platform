import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  MessageSquare,
  Search,
  Loader2,
  AlertCircle,
  Flag,
  Check,
  BookOpen,
  LayoutGrid,
  Trophy,
  Calendar,
  Users,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Database,
} from 'lucide-react';
import {
  ChatbotService,
  ChatServiceError,
  formatToolName,
  getPopularQuestions,
  type ChatResponse,
  type ChatSources,
  type Rule,
  type ClassSummary,
  type EntryResult,
  type TrialSummary,
  type PopularQuestion,
} from '../../services/chatbotService';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { logger } from '@/utils/logger';
import { FAQSection } from './FAQSection';
import { getFAQCount } from '@/services/faq';
import './AskMyK9Q.css';

interface AskMyK9QProps {
  isOpen: boolean;
  onClose: () => void;
}

type SourceType = 'rules' | 'classes' | 'entries' | 'trials';

// =============================================================================
// HELPER FUNCTIONS (extracted to reduce component complexity)
// =============================================================================

function parseOrgAndSport(orgString: string): { organizationCode: string; sportCode: string } {
  const parts = orgString.trim().split(/\s+/);
  const organizationCode = parts[0] || 'AKC';
  const sportName = parts.slice(1).join(' ').toLowerCase();

  const sportCodeMap: Record<string, string> = {
    'scent work': 'scent-work',
    'nosework': 'nosework',
    'scent detection': 'SD',
    'obedience': 'obedience',
    'rally': 'rally',
    'fast cat': 'fast-cat',
  };

  const sportCode = sportCodeMap[sportName] || 'scent-work';
  return { organizationCode, sportCode };
}

function getSourceIcon(sourceType: SourceType) {
  switch (sourceType) {
    case 'rules': return BookOpen;
    case 'classes': return LayoutGrid;
    case 'entries': return Users;
    case 'trials': return Calendar;
    default: return MessageSquare;
  }
}

function getSourceLabel(sourceType: SourceType): string {
  switch (sourceType) {
    case 'rules': return 'Rules';
    case 'classes': return 'Classes';
    case 'entries': return 'Entries';
    case 'trials': return 'Trials';
    default: return sourceType;
  }
}

function getSourceCount(sources: ChatSources, sourceType: SourceType): number {
  const data = sources[sourceType];
  return Array.isArray(data) ? data.length : 0;
}

// =============================================================================
// ANSWER SECTION COMPONENT (extracted to reduce main component complexity)
// =============================================================================

interface AnswerSectionProps {
  response: ChatResponse;
  feedbackStatus: 'idle' | 'submitting' | 'success' | 'error';
  ratingStatus: 'idle' | 'submitting' | 'submitted';
  submittedRating: number | null;
  onReportIssue: () => void;
  onRate: (rating: number) => void;
}

const AnswerSection: React.FC<AnswerSectionProps> = ({
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
        {/* Source indicator - FAQ or AI */}
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

    {/* Rating and Feedback Row */}
    <div className="chat-feedback-row">
      {/* Thumbs up/down rating */}
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

      {/* Report issue button */}
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

// =============================================================================
// SOURCES SECTION COMPONENT (extracted to reduce main component complexity)
// =============================================================================

interface SourcesSectionProps {
  sources: ChatSources;
  expandedSource: SourceType | null;
  expandedRuleId: string | null;
  onToggleSource: (sourceType: SourceType) => void;
  onToggleRule: (ruleId: string) => void;
}

const SourcesSection: React.FC<SourcesSectionProps> = ({
  sources,
  expandedSource,
  expandedRuleId,
  onToggleSource,
  onToggleRule,
}) => (
  <div className="chat-sources">
    <div className="chat-sources-header">Sources</div>

    {(Object.keys(sources) as SourceType[]).map((sourceType) => {
      const count = getSourceCount(sources, sourceType);
      if (count === 0) return null;

      const Icon = getSourceIcon(sourceType);
      const isExpanded = expandedSource === sourceType;

      return (
        <div key={sourceType} className="chat-source-section">
          <button
            className="chat-source-header"
            onClick={() => onToggleSource(sourceType)}
            aria-expanded={isExpanded}
          >
            <div className="chat-source-title">
              <Icon size={16} />
              <span>{getSourceLabel(sourceType)}</span>
              <span className="chat-source-count">({count})</span>
            </div>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {isExpanded && (
            <div className="chat-source-content">
              {sourceType === 'rules' && (
                <RulesSourceList
                  rules={sources.rules || []}
                  expandedRuleId={expandedRuleId}
                  onToggleRule={onToggleRule}
                />
              )}
              {sourceType === 'classes' && (
                <ClassesSourceList classes={sources.classes || []} />
              )}
              {sourceType === 'entries' && (
                <EntriesSourceList entries={sources.entries || []} />
              )}
              {sourceType === 'trials' && (
                <TrialsSourceList trials={sources.trials || []} />
              )}
            </div>
          )}
        </div>
      );
    })}
  </div>
);

// Static fallback queries (used when offline or no popular data)
const FALLBACK_QUERIES = {
  rules: [
    'Time limit Master Interior',
    'Handler touches dog penalty',
    'What qualifies as a false alert?',
  ],
  showData: [
    'Who got 1st place Saturday',
    'How many dogs qualified today',
    'Show me Exterior results',
  ],
};

// Keywords that indicate a rules question vs show data question
const RULES_KEYWORDS = [
  'time limit', 'penalty', 'false alert', 'handler', 'regulation', 'rule',
  'leash', 'fault', 'nq', 'disqualif', 'allowed', 'prohibited', 'requirements',
  'maximum', 'minimum', 'seconds', 'minutes', 'area', 'hide', 'alert',
];

const SHOW_DATA_KEYWORDS = [
  'who', 'how many', 'results', 'place', '1st', '2nd', '3rd', 'first', 'second',
  'third', 'qualified', 'score', 'today', 'saturday', 'sunday', 'friday',
  'yesterday', 'class', 'entries', 'dogs', 'running', 'completed',
];

/**
 * Categorize a question as 'rules' or 'showData' based on keywords
 */
function categorizeQuestion(query: string): 'rules' | 'showData' {
  const lowerQuery = query.toLowerCase();

  const rulesScore = RULES_KEYWORDS.filter(kw => lowerQuery.includes(kw)).length;
  const showDataScore = SHOW_DATA_KEYWORDS.filter(kw => lowerQuery.includes(kw)).length;

  // If show data keywords dominate, it's a show data question
  // Default to rules if unclear (more likely to be asking about regulations)
  return showDataScore > rulesScore ? 'showData' : 'rules';
}

/**
 * Split popular questions into categorized buckets
 */
function categorizePopularQuestions(questions: PopularQuestion[]): {
  rules: string[];
  showData: string[];
} {
  const rules: string[] = [];
  const showData: string[] = [];

  for (const q of questions) {
    const category = categorizeQuestion(q.query);
    if (category === 'rules' && rules.length < 3) {
      rules.push(q.query);
    } else if (category === 'showData' && showData.length < 3) {
      showData.push(q.query);
    }

    // Stop if we have enough in both categories
    if (rules.length >= 3 && showData.length >= 3) break;
  }

  return { rules, showData };
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
    setIsFAQExpanded(false); // Collapse FAQ when searching

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
      // If no logId, we can't submit rating (e.g., cached response)
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
        // Reset on failure
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
      // Fetch more questions (12) to have enough for categorization into rules/show data
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

  // Compute example queries for the input footer
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
      {/* Backdrop */}
      <div
        className="chat-panel-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Panel - Traditional Chat Layout */}
      <aside
        className="chat-panel chat-panel-traditional"
        role="complementary"
        aria-label="AskQ"
      >
        {/* Header */}
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

        {/* Main Content Area - Scrollable */}
        <div className="chat-content-area">
          {/* Loading State */}
          {isLoading && (
            <div className="chat-loading-state">
              <Loader2 className="animate-spin" size={32} />
              <p>Searching...</p>
            </div>
          )}

          {/* Error State */}
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

          {/* Answer Section */}
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

              {/* Sources Section */}
              {response.sources && Object.keys(response.sources).length > 0 && (
                <SourcesSection
                  sources={response.sources}
                  expandedSource={expandedSource}
                  expandedRuleId={expandedRuleId}
                  onToggleSource={toggleSourceExpansion}
                  onToggleRule={toggleRuleExpansion}
                />
              )}

              {/* Ask Another Button */}
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

          {/* Welcome State - No Result Yet */}
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

        {/* Footer - FAQ + Examples + Input (Traditional Chat Layout) */}
        <div className="chat-input-footer">
          {/* Collapsible FAQ Section */}
          <div className="chat-faq-collapsible">
            <button
              className={`chat-faq-toggle ${isFAQExpanded ? 'expanded' : ''}`}
              onClick={() => setIsFAQExpanded(!isFAQExpanded)}
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
                <FAQSection onAskAI={handleFAQAskAI} />
              </div>
            )}
          </div>

          {/* Example Queries - show when no result */}
          {!hasResult && !isLoading && (
            <div className="chat-examples">
              <div className="chat-examples-group">
                <span className="chat-examples-label">{rulesLabel}</span>
                <div className="chat-example-chips">
                  {rulesQueries.map((example) => (
                    <button
                      key={example}
                      className="chat-example-chip"
                      onClick={() => handleExampleClick(example)}
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
                      onClick={() => handleExampleClick(example)}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Search Input - At Bottom */}
          <div className="chat-search-section">
            <div className="chat-search-container">
              <div className="chat-search-input-wrapper">
                <Search className="chat-search-icon" size={18} />
                <input
                  type="text"
                  className="chat-search-input"
                  placeholder="Ask about rules or your show data..."
                  value={query}
                  onChange={handleQueryChange}
                  onKeyPress={handleKeyPress}
                  autoFocus
                />
                {isLoading && (
                  <Loader2 className="chat-loading-icon animate-spin" size={18} />
                )}
              </div>
              <button
                onClick={handleSearchClick}
                className="chat-search-btn"
                disabled={!query.trim() || isLoading}
              >
                Ask
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

// =============================================================================
// SOURCE LIST COMPONENTS
// =============================================================================

interface RulesSourceListProps {
  rules: Rule[];
  expandedRuleId: string | null;
  onToggleRule: (id: string) => void;
}

const RulesSourceList: React.FC<RulesSourceListProps> = ({
  rules,
  expandedRuleId,
  onToggleRule,
}) => {
  const formatMeasurement = (key: string, value: string | number | boolean): string => {
    const labels: Record<string, string> = {
      min_area_sq_ft: 'Min Area',
      max_area_sq_ft: 'Max Area',
      time_limit_minutes: 'Time Limit',
      min_hides: 'Min Hides',
      max_hides: 'Max Hides',
      max_leash_length_feet: 'Max Leash',
      warning_seconds: 'Warning Time',
    };

    const units: Record<string, string> = {
      min_area_sq_ft: 'sq ft',
      max_area_sq_ft: 'sq ft',
      time_limit_minutes: 'min',
      max_leash_length_feet: 'ft',
      warning_seconds: 'sec',
    };

    const label = labels[key] || key;
    const unit = units[key] || '';
    const displayValue = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;

    return `${label}: ${displayValue}${unit ? ' ' + unit : ''}`;
  };

  return (
    <div className="chat-rules-list">
      {rules.map((rule) => (
        <div key={rule.id} className="chat-rule-card">
          <button
            className="chat-rule-header"
            onClick={() => onToggleRule(rule.id)}
            aria-expanded={expandedRuleId === rule.id}
          >
            <div className="chat-rule-title-section">
              <h4 className="chat-rule-title">{rule.title}</h4>
              <span className="chat-rule-section">{rule.section}</span>
            </div>
            <div className="chat-rule-badges">
              {rule.categories.level && (
                <span className="chat-badge level">{rule.categories.level}</span>
              )}
              {rule.categories.element && (
                <span className="chat-badge element">{rule.categories.element}</span>
              )}
            </div>
          </button>

          {expandedRuleId === rule.id && (
            <div className="chat-rule-content">
              <p>{rule.content}</p>
              {Object.keys(rule.measurements).length > 0 && (
                <div className="chat-measurements">
                  <h5>Key Measurements:</h5>
                  <ul>
                    {Object.entries(rule.measurements).map(([key, value]) => (
                      <li key={key}>{formatMeasurement(key, value as string | number | boolean)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

interface ClassesSourceListProps {
  classes: ClassSummary[];
}

const ClassesSourceList: React.FC<ClassesSourceListProps> = ({ classes }) => {
  const formatStatus = (status: string): string => {
    const statusLabels: Record<string, string> = {
      'no-status': 'Not Started',
      'setup': 'Setup',
      'briefing': 'Briefing',
      'break': 'On Break',
      'in_progress': 'In Progress',
      'completed': 'Completed',
    };
    return statusLabels[status] || status;
  };

  return (
    <div className="chat-data-table">
      <div className="chat-data-header">
        <span>Class</span>
        <span>Entries</span>
        <span>Status</span>
      </div>
      {classes.map((cls, idx) => (
        <div key={idx} className="chat-data-row">
          <div className="chat-data-cell primary">
            <span className="chat-class-name">{cls.element} {cls.level}{cls.section ? ` ${cls.section}` : ''}</span>
            {cls.judge_name && <span className="chat-class-judge">Judge: {cls.judge_name}</span>}
          </div>
          <div className="chat-data-cell">
            <span>{cls.scored_entries}/{cls.total_entries}</span>
            {cls.qualified_count > 0 && (
              <span className="chat-qualified-count">
                <Trophy size={12} /> {cls.qualified_count}Q
              </span>
            )}
          </div>
          <div className="chat-data-cell">
            <span className={`chat-status-badge ${cls.class_status}`}>
              {formatStatus(cls.class_status)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

interface EntriesSourceListProps {
  entries: EntryResult[];
}

const EntriesSourceList: React.FC<EntriesSourceListProps> = ({ entries }) => {
  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  const getOrdinal = (n: number): string => {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  };

  return (
    <div className="chat-data-table entries">
      <div className="chat-data-header">
        <span>#</span>
        <span>Dog/Handler</span>
        <span>Result</span>
      </div>
      {entries.map((entry, idx) => (
        <div key={idx} className="chat-data-row">
          <div className="chat-data-cell armband">
            <span className="chat-armband">{entry.armband_number}</span>
          </div>
          <div className="chat-data-cell primary">
            <span className="chat-dog-name">{entry.call_name}</span>
            <span className="chat-handler-name">{entry.handler}</span>
          </div>
          <div className="chat-data-cell result">
            {entry.is_scored ? (
              <>
                <span className={`chat-result-badge ${entry.result_status}`}>
                  {entry.result_status === 'qualified' ? 'Q' : 'NQ'}
                </span>
                {entry.time !== null && (
                  <span className="chat-time">{formatTime(entry.time)}</span>
                )}
                {entry.placement && entry.placement > 0 && entry.placement <= 4 && (
                  <span className="chat-placement-badge">{getOrdinal(entry.placement)}</span>
                )}
              </>
            ) : (
              <span className="chat-not-scored">-</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

interface TrialsSourceListProps {
  trials: TrialSummary[];
}

const TrialsSourceList: React.FC<TrialsSourceListProps> = ({ trials }) => {
  return (
    <div className="chat-trials-list">
      {trials.map((trial, idx) => (
        <div key={idx} className="chat-trial-card">
          <div className="chat-trial-name">
            {trial.trial_name || `Trial ${trial.trial_number}`}
          </div>
          <div className="chat-trial-details">
            <span className="chat-trial-date">
              <Calendar size={14} />
              {new Date(trial.trial_date).toLocaleDateString()}
            </span>
            {trial.competition_type && (
              <span className="chat-trial-type">{trial.competition_type}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AskMyK9Q;
