import { supabase } from '../lib/supabase';
import { logger } from '@/utils/logger';

/**
 * Chatbot Service
 *
 * Connects to the ask-myk9q Edge Function for AI-powered
 * natural language queries about both rules AND show data.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ChatRequest {
  message: string;
  licenseKey: string;
  organizationCode?: string;
  sportCode?: string;
}

export interface Rule {
  id: string;
  section: string;
  title: string;
  content: string;
  categories: { level?: string; element?: string };
  keywords: string[];
  measurements: Record<string, unknown>;
}

export interface ClassSummary {
  class_id: number;
  element: string;
  level: string;
  section: string | null;
  judge_name: string | null;
  class_status: string;
  total_entries: number;
  scored_entries: number;
  checked_in_count: number;
  qualified_count: number;
  nq_count: number;
  trial_date: string;
  trial_name: string;
  briefing_time: string | null;
  start_time: string | null;
}

export interface EntryResult {
  armband_number: string;
  call_name: string;
  handler: string;
  entry_status: string;
  result_status: string | null;
  time: number | null;
  faults: number | null;
  placement: number | null;
  is_scored: boolean;
  element: string;
  level: string;
}

export interface TrialSummary {
  trial_id: string;
  trial_number: number;
  trial_date: string;
  trial_name: string;
  competition_type: string;
  show_name: string;
}

export interface ChatSources {
  rules?: Rule[];
  classes?: ClassSummary[];
  entries?: EntryResult[];
  trials?: TrialSummary[];
}

export interface ChatResponse {
  answer: string;
  toolsUsed: string[];
  sources?: ChatSources;
  source?: 'faq' | 'ai'; // Whether answer came from FAQ lookup or Claude AI
  logId?: string; // For rating submission
  cached?: boolean;
}

export class ChatServiceError extends Error {
  code: string;
  statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = 'ChatServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

interface CachedResponse {
  response: ChatResponse;
  timestamp: number;
  toolsUsed: string[];
}

// Cache with different TTLs based on query type
const chatCache = new Map<string, CachedResponse>();
const CACHE_TTL_RULES = 5 * 60 * 1000; // 5 minutes for rules (static)
const CACHE_TTL_DATA = 30 * 1000; // 30 seconds for show data (changes frequently)
const MAX_CACHE_SIZE = 30;

// =============================================================================
// SERVICE
// =============================================================================

/**
 * Service for AI-powered chatbot queries about rules and show data
 */
export class ChatbotService {
  /**
   * Send a message to the chatbot
   *
   * @param request - The chat request with message and context
   * @returns Chat response with answer and sources
   * @throws ChatServiceError on failure
   *
   * @example
   * const response = await ChatbotService.sendMessage({
   *   message: "How many dogs are in Container Novice?",
   *   licenseKey: "myK9Q1-a260f472-e0d76a33-4b6c264c"
   * });
   */
  static async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    const { message, licenseKey, organizationCode, sportCode } = request;

    // Validate inputs
    if (!message?.trim()) {
      throw new ChatServiceError('Message is required', 'INVALID_MESSAGE', 400);
    }
    if (!licenseKey) {
      throw new ChatServiceError(
        'License key is required',
        'MISSING_LICENSE_KEY',
        400
      );
    }

    // Check cache
    const cacheKey = JSON.stringify({
      message: message.toLowerCase().trim(),
      licenseKey,
      organizationCode,
      sportCode,
    });
    const cached = chatCache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      logger.log('🤖 [ChatbotService] Cache hit for:', message.substring(0, 50));
      return { ...cached.response, cached: true };
    }

    try {
      logger.log('🤖 [ChatbotService] Sending message:', message.substring(0, 50));

      // Call the Edge Function
      const { data, error } = await supabase.functions.invoke<ChatResponse>(
        'ask-myk9q',
        {
          body: { message, licenseKey, organizationCode, sportCode },
        }
      );

      if (error) {
        logger.error('🤖 [ChatbotService] Edge Function error:', error);
        throw new ChatServiceError(
          error.message || 'Failed to get response',
          'EDGE_FUNCTION_ERROR',
          500
        );
      }

      if (!data) {
        throw new ChatServiceError(
          'No response from chatbot',
          'NO_RESPONSE',
          500
        );
      }

      // Cache the response
      chatCache.set(cacheKey, {
        response: data,
        timestamp: Date.now(),
        toolsUsed: data.toolsUsed || [],
      });

      // Clean up old cache entries
      this.cleanCache();

      logger.log('🤖 [ChatbotService] Response received, tools used:', data.toolsUsed);
      return { ...data, cached: false };
    } catch (err) {
      if (err instanceof ChatServiceError) {
        throw err;
      }

      logger.error('🤖 [ChatbotService] Unexpected error:', err);
      throw new ChatServiceError(
        err instanceof Error ? err.message : 'An unexpected error occurred',
        'UNEXPECTED_ERROR',
        500
      );
    }
  }

  /**
   * Check if a cached response is still valid
   * Uses shorter TTL for data queries (they change frequently)
   */
  private static isCacheValid(cached: CachedResponse): boolean {
    const elapsed = Date.now() - cached.timestamp;

    // If only rules were used, use longer TTL
    const isRulesOnly =
      cached.toolsUsed.length === 1 &&
      cached.toolsUsed[0] === 'search_rules';

    const ttl = isRulesOnly ? CACHE_TTL_RULES : CACHE_TTL_DATA;
    return elapsed < ttl;
  }

  /**
   * Clean up old cache entries to prevent memory growth
   */
  private static cleanCache(): void {
    if (chatCache.size <= MAX_CACHE_SIZE) {
      return;
    }

    // Sort by timestamp and keep the newest entries
    const entries = Array.from(chatCache.entries());
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp);

    // Delete oldest entries beyond max size
    const toDelete = entries.slice(MAX_CACHE_SIZE);
    toDelete.forEach(([key]) => chatCache.delete(key));

    logger.log(`🤖 [ChatbotService] Cache cleaned: ${toDelete.length} entries removed`);
  }

  /**
   * Clear all cached responses
   */
  static clearCache(): void {
    const size = chatCache.size;
    chatCache.clear();
    logger.log(`🤖 [ChatbotService] Cache cleared: ${size} entries removed`);
  }

  /**
   * Get cache statistics for debugging
   */
  static getCacheStats(): {
    size: number;
    entries: Array<{ key: string; age: number; toolsUsed: string[] }>;
  } {
    const now = Date.now();
    return {
      size: chatCache.size,
      entries: Array.from(chatCache.entries()).map(([key, value]) => ({
        key: key.substring(0, 50) + '...',
        age: Math.round((now - value.timestamp) / 1000),
        toolsUsed: value.toolsUsed,
      })),
    };
  }

  /**
   * Submit a rating for a chatbot response
   *
   * @param logId - The log entry ID from the response
   * @param rating - Rating from 1-5 stars
   * @returns Success status
   */
  static async submitRating(logId: string, rating: number): Promise<boolean> {
    if (!logId || rating < 1 || rating > 5) {
      logger.error('🤖 [ChatbotService] Invalid rating parameters:', { logId, rating });
      return false;
    }

    try {
      logger.log('🤖 [ChatbotService] Submitting rating:', { logId, rating });

      const { error } = await supabase.functions.invoke('ask-myk9q', {
        body: { action: 'rate', logId, rating },
      });

      if (error) {
        logger.error('🤖 [ChatbotService] Rating submission error:', error);
        return false;
      }

      logger.log('🤖 [ChatbotService] Rating submitted successfully');
      return true;
    } catch (err) {
      logger.error('🤖 [ChatbotService] Rating submission failed:', err);
      return false;
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format a tool name for display
 */
export function formatToolName(toolName: string): string {
  const names: Record<string, string> = {
    search_rules: 'Rules',
    get_class_summary: 'Classes',
    get_entry_results: 'Results',
    get_trial_overview: 'Trials',
    search_entries: 'Entries',
  };
  return names[toolName] || toolName;
}

/**
 * Get an icon name for a tool (for use with Lucide icons)
 */
export function getToolIcon(toolName: string): string {
  const icons: Record<string, string> = {
    search_rules: 'BookOpen',
    get_class_summary: 'LayoutGrid',
    get_entry_results: 'Trophy',
    get_trial_overview: 'Calendar',
    search_entries: 'Search',
  };
  return icons[toolName] || 'MessageSquare';
}

// =============================================================================
// POPULAR QUESTIONS
// =============================================================================

export interface PopularQuestion {
  query: string;
  ask_count: number;
}

// Cache for popular questions (refreshed every 5 minutes)
let popularQuestionsCache: PopularQuestion[] | null = null;
let popularQuestionsCacheTime = 0;
const POPULAR_QUESTIONS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get popular questions asked by users
 * Falls back to default examples if no data or offline
 */
export async function getPopularQuestions(limit = 6): Promise<PopularQuestion[]> {
  const now = Date.now();

  // Return cached if valid
  if (popularQuestionsCache && now - popularQuestionsCacheTime < POPULAR_QUESTIONS_CACHE_TTL) {
    return popularQuestionsCache;
  }

  // Default fallback questions
  const defaultQuestions: PopularQuestion[] = [
    { query: 'What is the time limit for Exterior Advanced?', ask_count: 0 },
    { query: 'How many dogs are in Container Novice?', ask_count: 0 },
    { query: 'Who placed first in Interior Master?', ask_count: 0 },
    { query: 'What classes are running right now?', ask_count: 0 },
    { query: 'How did Buddy do today?', ask_count: 0 },
    { query: "What's the judge for Novice?", ask_count: 0 },
  ];

  // Don't try to fetch if offline
  if (!navigator.onLine) {
    return defaultQuestions.slice(0, limit);
  }

  try {
    const { data, error } = await supabase.rpc('get_popular_chatbot_questions', {
      p_limit: limit,
    });

    if (error) {
      logger.error('🤖 [ChatbotService] Failed to fetch popular questions:', error);
      return defaultQuestions.slice(0, limit);
    }

    // If we got results, cache and return them
    if (data && data.length > 0) {
      popularQuestionsCache = data;
      popularQuestionsCacheTime = now;
      return data;
    }

    // Not enough data yet, return defaults
    return defaultQuestions.slice(0, limit);
  } catch (err) {
    logger.error('🤖 [ChatbotService] Error fetching popular questions:', err);
    return defaultQuestions.slice(0, limit);
  }
}
