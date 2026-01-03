/**
 * FAQ Section Component
 *
 * Displays browsable FAQ content organized by category.
 * Content is fetched from Supabase and cached in IndexedDB for offline access.
 */

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Rocket,
  Search,
  CheckCircle,
  ClipboardList,
  BarChart2,
  Bell,
  Users,
  Shield,
  WifiOff,
  Settings,
  HelpCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useFAQ, type FAQIconName } from '@/services/faq';

// Icon mapping for categories
const categoryIcons: Record<FAQIconName, React.ComponentType<{ size?: number }>> = {
  'rocket': Rocket,
  'search': Search,
  'check-circle': CheckCircle,
  'clipboard': ClipboardList,
  'bar-chart': BarChart2,
  'bell': Bell,
  'users': Users,
  'shield': Shield,
  'wifi-off': WifiOff,
  'settings': Settings,
  'help-circle': HelpCircle,
};

interface FAQSectionProps {
  /** Filter to show only specific category IDs */
  filterCategories?: string[];
  /** Callback when user wants to ask AI about a topic */
  onAskAI?: (question: string) => void;
  /** Maximum height before scrolling (CSS value) */
  maxHeight?: string;
}

export const FAQSection: React.FC<FAQSectionProps> = ({
  filterCategories,
  onAskAI,
  maxHeight = '100%',
}) => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  // Load FAQ data from Supabase (cached in IndexedDB for offline)
  const { categories: displayCategories, isLoading, error, refresh } = useFAQ(filterCategories);

  const toggleCategory = (categoryId: string) => {
    if (expandedCategory === categoryId) {
      setExpandedCategory(null);
      setExpandedQuestion(null);
    } else {
      setExpandedCategory(categoryId);
      setExpandedQuestion(null);
    }
  };

  const toggleQuestion = (questionKey: string) => {
    setExpandedQuestion(expandedQuestion === questionKey ? null : questionKey);
  };

  const handleAskAI = (question: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onAskAI?.(question);
  };

  // Loading state
  if (isLoading && displayCategories.length === 0) {
    return (
      <div className="faq-section faq-loading" style={{ maxHeight, padding: '2rem', textAlign: 'center' }}>
        <Loader2 size={24} className="faq-spinner" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>Loading help content...</p>
      </div>
    );
  }

  // Error state with retry
  if (error && displayCategories.length === 0) {
    return (
      <div className="faq-section faq-error" style={{ maxHeight, padding: '2rem', textAlign: 'center' }}>
        <AlertCircle size={24} style={{ color: 'var(--token-error)' }} />
        <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{error}</p>
        <button
          onClick={() => refresh()}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            background: 'var(--accent-primary)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (displayCategories.length === 0) {
    return (
      <div className="faq-section faq-empty" style={{ maxHeight, padding: '2rem', textAlign: 'center' }}>
        <HelpCircle size={24} style={{ color: 'var(--text-secondary)' }} />
        <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>No FAQ content available.</p>
      </div>
    );
  }

  return (
    <div className="faq-section" style={{ maxHeight, overflowY: 'auto' }}>
      <div className="faq-categories">
        {displayCategories.map((category) => {
          const IconComponent = categoryIcons[category.icon] || HelpCircle;
          const isExpanded = expandedCategory === category.id;

          return (
            <div key={category.id} className="faq-category">
              {/* Category Header */}
              <button
                className={`faq-category-header ${isExpanded ? 'expanded' : ''}`}
                onClick={() => toggleCategory(category.id)}
                aria-expanded={isExpanded}
              >
                <div className="faq-category-title">
                  <IconComponent size={18} />
                  <span>{category.title}</span>
                  <span className="faq-category-count">({category.items.length})</span>
                </div>
                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>

              {/* Questions List */}
              {isExpanded && (
                <div className="faq-questions">
                  {category.items.map((item, idx) => {
                    const questionKey = `${category.id}-${idx}`;
                    const isQuestionExpanded = expandedQuestion === questionKey;

                    return (
                      <div key={questionKey} className="faq-question">
                        <button
                          className={`faq-question-header ${isQuestionExpanded ? 'expanded' : ''}`}
                          onClick={() => toggleQuestion(questionKey)}
                          aria-expanded={isQuestionExpanded}
                        >
                          <span className="faq-question-text">{item.question}</span>
                          {isQuestionExpanded ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </button>

                        {isQuestionExpanded && (
                          <div className="faq-answer">
                            <p>{item.answer}</p>
                            {onAskAI && (
                              <button
                                className="faq-ask-ai-btn"
                                onClick={(e) => handleAskAI(item.question, e)}
                                title="Ask AskQ for more details"
                              >
                                Ask AI for more details →
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FAQSection;
