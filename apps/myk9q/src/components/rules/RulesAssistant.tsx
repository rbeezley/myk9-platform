import React, { useState, useCallback, useEffect } from 'react';
import {  X,
  BookOpen,
  Search,
  Loader2,
  AlertCircle,
  Info,
  Flag,
  Check
} from 'lucide-react';
import { RulesService, type Rule, type RulesServiceError } from '../../services/rulesService';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { logger } from '@/utils/logger';
import './RulesAssistant.css';

interface RulesAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesAssistant: React.FC<RulesAssistantProps> = ({ isOpen, onClose }) => {
  const { showContext } = useAuth();
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [results, setResults] = useState<Rule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [_isOnline, setIsOnline] = useState(navigator.onLine);
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  // Parse organization and sport from showContext.org (e.g., "AKC Scent Work")
  const parseOrgAndSport = (orgString: string): { organizationCode: string; sportCode: string } => {
    const parts = orgString.trim().split(/\s+/);
    const organizationCode = parts[0] || 'AKC'; // First word is organization
    const sportName = parts.slice(1).join(' ').toLowerCase(); // Rest is sport name

    // Map sport names to codes
    const sportCodeMap: Record<string, string> = {
      'scent work': 'scent-work',
      'nosework': 'nosework',
      'obedience': 'obedience',
      'rally': 'rally',
      'fast cat': 'fast-cat',
      // Add more mappings as needed
    };

    const sportCode = sportCodeMap[sportName] || 'scent-work'; // Default to scent-work
    return { organizationCode, sportCode };
  };

  const { organizationCode, sportCode } = showContext?.org
    ? parseOrgAndSport(showContext.org)
    : { organizationCode: 'AKC', sportCode: 'scent-work' }; // Fallback defaults

  const handleSearch = useCallback(async (searchQuery: string, forceRefresh = false) => {
    // Reset feedback status when starting a new search
    setFeedbackStatus('idle');

    if (!searchQuery.trim()) {
      setResults([]);
      setAnswer(null);
      setError(null);
      setSearchPerformed(false);
      return;
    }

    // Check if online before searching
    if (!navigator.onLine) {
      setError('Rules Assistant requires an internet connection. Please connect to the internet and try again.');
      setSearchPerformed(true);
      setAnswer(null);
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSearchPerformed(true);

    // Ensure minimum loading time for visual feedback (500ms)
    const startTime = Date.now();

    try {
// Clear cache for this query if forceRefresh is true
      if (forceRefresh) {
        RulesService.clearCacheForQuery(searchQuery);
      }

      const response = await RulesService.searchRules({
        query: searchQuery,
        organizationCode,
        sportCode
      });

      // Wait for minimum time to show loading state
      const elapsed = Date.now() - startTime;
      if (elapsed < 500) {
        await new Promise(resolve => setTimeout(resolve, 500 - elapsed));
      }

      setAnswer(response.answer);
      setResults(response.results);

      if (response.results.length === 0) {
        setError('No rules found matching your search. Try different keywords or be more specific.');
      }
    } catch (err) {
      logger.error('📚 [RulesAssistant] Search error:', err);
      const error = err as RulesServiceError;
      setError(error.message || 'Failed to search rules. Please try again.');
      setAnswer(null);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
  };

  const handleSearchClick = () => {
    // Force a fresh search when button is clicked explicitly
    handleSearch(query, true);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Force a fresh search when Enter is pressed
      handleSearch(query, true);
    }
  };

  const toggleRuleExpansion = (ruleId: string) => {
    setExpandedRuleId(expandedRuleId === ruleId ? null : ruleId);
  };

  const handleReportIssue = async () => {
    if (feedbackStatus === 'submitting' || feedbackStatus === 'success') return;

    setFeedbackStatus('submitting');

    try {
      const { error: insertError } = await supabase
        .from('rules_feedback')
        .insert({
          question: query,
          ai_response: answer || '',
          show_id: showContext?.showId ? parseInt(showContext.showId, 10) : null,
          license_key: showContext?.licenseKey || null,
        });

      if (insertError) {
        logger.error('Failed to submit feedback:', insertError);
        setFeedbackStatus('error');
        // Reset after 3 seconds so user can retry
        setTimeout(() => setFeedbackStatus('idle'), 3000);
      } else {
        setFeedbackStatus('success');
        // Keep success state visible
      }
    } catch (err) {
      logger.error('Failed to submit feedback:', err);
      setFeedbackStatus('error');
      setTimeout(() => setFeedbackStatus('idle'), 3000);
    }
  };

  const formatMeasurement = (key: string, value: string | number | boolean): string => {
    const labels: Record<string, string> = {
      min_area_sq_ft: 'Min Area',
      max_area_sq_ft: 'Max Area',
      time_limit_minutes: 'Time Limit',
      min_height_inches: 'Min Height',
      max_height_inches: 'Max Height',
      min_hides: 'Min Hides',
      max_hides: 'Max Hides',
      hides_known: 'Hides Known to Handler',
      num_containers: 'Containers',
      max_leash_length_feet: 'Max Leash',
      warning_seconds: 'Warning Time',
    };

    const units: Record<string, string> = {
      min_area_sq_ft: 'sq ft',
      max_area_sq_ft: 'sq ft',
      time_limit_minutes: 'min',
      min_height_inches: 'in',
      max_height_inches: 'in',
      max_leash_length_feet: 'ft',
      warning_seconds: 'sec',
    };

    const label = labels[key] || key;
    const unit = units[key] || '';

    // Format boolean values as Yes/No
    let displayValue = value;
    if (typeof value === 'boolean') {
      displayValue = value ? 'Yes' : 'No';
    }

    return `${label}: ${displayValue}${unit ? ' ' + unit : ''}`;
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
        setError('Rules Assistant requires an internet connection. Please connect to the internet and try again.');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [query]);

  // Clear search when panel closes
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setAnswer(null);
      setResults([]);
      setError(null);
      setSearchPerformed(false);
      setExpandedRuleId(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="rules-panel-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Panel */}
      <aside
        className="rules-panel"
        role="complementary"
        aria-label="Rules Assistant"
      >
        {/* Header */}
        <div className="rules-panel-header">
          <div className="rules-panel-title">
            <BookOpen size={24} />
            <h2>Rules Assistant</h2>
          </div>
          <button
            onClick={onClose}
            className="rules-close-btn"
            aria-label="Close rules assistant"
          >
            <X size={24} />
          </button>
        </div>

        {/* Beta Disclaimer */}
        <div className="rules-beta-disclaimer">
          <AlertCircle size={16} />
          <span>
            <strong>Beta Feature:</strong> This assistant is being refined. Please verify critical information against the official rulebook.
          </span>
        </div>

        {/* Search Input */}
        <div className="rules-search-container">
          <div className="rules-search-input-wrapper">
            <Search className="rules-search-icon" size={20} />
            <input
              type="text"
              className="rules-search-input"
              placeholder="Ask about AKC Scent Work rules..."
              value={query}
              onChange={handleQueryChange}
              onKeyPress={handleKeyPress}
              autoFocus
            />
            {isLoading && (
              <Loader2 className="rules-loading-icon" size={20} />
            )}
          </div>
          <button
            onClick={handleSearchClick}
            className="rules-search-btn"
            disabled={!query.trim() || isLoading}
          >
            Search
          </button>
        </div>

        {/* Search Instruction */}
        {query.trim() && !searchPerformed && !isLoading && (
          <div className="rules-search-instruction">
            <Info size={14} />
            <span>Press Enter or click Search to find rules</span>
          </div>
        )}

        {/* Help Text */}
        {!searchPerformed && !query.trim() && (
          <div className="rules-help-text">
            <Info size={16} />
            <span>
              Try: "what is the area size for exterior advanced?" or "how many hides in master buried?"
            </span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rules-error-state">
            <AlertCircle size={24} />
            <p>{error}</p>
          </div>
        )}

        {/* Answer Section */}
        {!isLoading && answer && (
          <div className="rules-answer-section">
            <div className="rules-answer-label">Answer:</div>
            <div className="rules-answer-text">{answer}</div>
            <button
              onClick={handleReportIssue}
              className={`rules-report-issue-btn ${feedbackStatus === 'success' ? 'success' : ''}`}
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
                  <span>Reported - Thanks!</span>
                </>
              ) : feedbackStatus === 'error' ? (
                <>
                  <AlertCircle size={14} />
                  <span>Failed - Retry</span>
                </>
              ) : (
                <>
                  <Flag size={14} />
                  <span>Report Issue</span>
                </>
              )}
            </button>
            {results.length > 0 && (
              <div className="rules-source-hint">
                View full rule details below for complete context
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {!isLoading && results.length > 0 && (
          <div className="rules-results">
            <div className="rules-results-header">
              <span>{answer ? 'Source Rules' : `Found ${results.length} ${results.length === 1 ? 'rule' : 'rules'}`} ({results.length})</span>
            </div>

            <div className="rules-results-list">
              {results.map((rule) => (
                <div key={rule.id} className="rules-result-card">
                  {/* Rule Header */}
                  <button
                    className="rules-result-header"
                    onClick={() => toggleRuleExpansion(rule.id)}
                    aria-expanded={expandedRuleId === rule.id}
                  >
                    <div className="rules-result-title-section">
                      <h3 className="rules-result-title">{rule.title}</h3>
                      <span className="rules-result-section">{rule.section}</span>
                    </div>
                    <div className="rules-result-categories">
                      {rule.categories.level && (
                        <span className="rules-category-badge level">{rule.categories.level}</span>
                      )}
                      {rule.categories.element && (
                        <span className="rules-category-badge element">{rule.categories.element}</span>
                      )}
                    </div>
                  </button>

                  {/* Rule Content (Expandable) */}
                  {expandedRuleId === rule.id && (
                    <div className="rules-result-content">
                      <p className="rules-content-text">{rule.content}</p>

                      {/* Measurements */}
                      {Object.keys(rule.measurements).length > 0 && (
                        <div className="rules-measurements">
                          <h4>Key Measurements:</h4>
                          <ul>
                            {Object.entries(rule.measurements).map(([key, value]) => (
                              <li key={key}>{formatMeasurement(key, value)}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Keywords */}
                      {rule.keywords.length > 0 && (
                        <div className="rules-keywords">
                          <span>Keywords:</span>
                          <div className="rules-keyword-tags">
                            {rule.keywords.slice(0, 8).map((keyword, idx) => (
                              <span key={idx} className="rules-keyword-tag">{keyword}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State (after search with no results) */}
        {!isLoading && searchPerformed && results.length === 0 && !error && (
          <div className="rules-empty-state">
            <BookOpen size={48} opacity={0.3} />
            <p>No rules found for "{query}"</p>
            <p className="rules-empty-hint">Try using different keywords or asking in a different way.</p>
          </div>
        )}
      </aside>
    </>
  );
};
