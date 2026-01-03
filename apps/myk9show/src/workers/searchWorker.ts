/**
 * Web Worker for handling search operations in the background
 * Prevents UI blocking when searching through thousands of records
 */

import { SearchableItem, SearchResult, SearchOptions } from '../utils/searchIndex';

interface SearchWorkerMessage {
  type: 'SEARCH' | 'BUILD_INDEX' | 'CLEAR_INDEX' | 'GET_SUGGESTIONS';
  payload: {
    items?: SearchableItem[];
    query?: string;
    options?: SearchOptions;
    limit?: number;
  };
  id: string;
}

interface SearchWorkerResponse {
  type: 'SEARCH_RESULT' | 'INDEX_BUILT' | 'INDEX_CLEARED' | 'SUGGESTIONS' | 'ERROR';
  payload: {
    success?: boolean;
    results?: SearchResult[];
    suggestions?: string[];
    error?: string;
    originalType?: string;
  };
  id: string;
}

// In-worker search index implementation
class WorkerSearchIndex {
  private items: Map<string, SearchableItem> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private ngramIndex: Map<string, Set<string>> = new Map();
  private ready = false;

  addItems(items: SearchableItem[]): void {
    items.forEach(item => this.addItem(item));
    this.ready = true;
  }

  addItem(item: SearchableItem): void {
    this.items.set(item.id, item);
    this.indexItem(item);
  }

  clear(): void {
    this.items.clear();
    this.invertedIndex.clear();
    this.ngramIndex.clear();
    this.ready = false;
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    if (!this.ready || !query.trim()) {
      return [];
    }

    const {
      maxResults = 50,
      fuzzyThreshold = 0.6,
      categories = [],
      minScore = 0.1
    } = options;

    const normalizedQuery = this.normalizeText(query);
    const queryTerms = this.tokenize(normalizedQuery);
    
    const candidates = this.findCandidates(queryTerms);
    const scoredResults: SearchResult[] = [];
    
    for (const itemId of candidates) {
      const item = this.items.get(itemId);
      if (!item) continue;
      
      if (categories.length > 0 && !categories.includes(item.type)) {
        continue;
      }
      
      const result = this.scoreItem(item, queryTerms, fuzzyThreshold);
      if (result.score >= minScore) {
        scoredResults.push(result);
      }
    }
    
    return scoredResults
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  getSuggestions(partialQuery: string, limit = 5): string[] {
    const normalized = this.normalizeText(partialQuery);
    const suggestions = new Set<string>();
    
    for (const [term] of this.invertedIndex) {
      if (term.startsWith(normalized) && term !== normalized) {
        suggestions.add(term);
        if (suggestions.size >= limit) break;
      }
    }
    
    return Array.from(suggestions);
  }

  private indexItem(item: SearchableItem): void {
    const tokens = this.tokenize(item.searchText);
    
    tokens.forEach(token => {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set());
      }
      this.invertedIndex.get(token)!.add(item.id);
    });
    
    const ngrams = this.generateNgrams(item.searchText, 2);
    ngrams.forEach(ngram => {
      if (!this.ngramIndex.has(ngram)) {
        this.ngramIndex.set(ngram, new Set());
      }
      this.ngramIndex.get(ngram)!.add(item.id);
    });
  }

  private findCandidates(queryTerms: string[]): Set<string> {
    const candidates = new Set<string>();
    
    queryTerms.forEach(term => {
      const exactMatches = this.invertedIndex.get(term);
      if (exactMatches) {
        exactMatches.forEach(id => candidates.add(id));
      }
    });
    
    queryTerms.forEach(term => {
      const ngrams = this.generateNgrams(term, 2);
      ngrams.forEach(ngram => {
        const matches = this.ngramIndex.get(ngram);
        if (matches) {
          matches.forEach(id => candidates.add(id));
        }
      });
    });
    
    return candidates;
  }

  private scoreItem(item: SearchableItem, queryTerms: string[], fuzzyThreshold: number): SearchResult {
    const itemTokens = this.tokenize(item.searchText);
    const matchedTerms: string[] = [];
    let totalScore = 0;
    
    queryTerms.forEach(queryTerm => {
      let bestMatch = 0;
      let bestMatchTerm = '';
      
      itemTokens.forEach(itemToken => {
        if (itemToken === queryTerm) {
          bestMatch = Math.max(bestMatch, 1.0);
          bestMatchTerm = itemToken;
        }
        else if (itemToken.startsWith(queryTerm) || queryTerm.startsWith(itemToken)) {
          bestMatch = Math.max(bestMatch, 0.8);
          bestMatchTerm = itemToken;
        }
        else {
          const similarity = this.calculateSimilarity(queryTerm, itemToken);
          if (similarity >= fuzzyThreshold) {
            bestMatch = Math.max(bestMatch, similarity * 0.6);
            bestMatchTerm = itemToken;
          }
        }
      });
      
      if (bestMatch > 0) {
        totalScore += bestMatch;
        matchedTerms.push(bestMatchTerm);
      }
    });
    
    const normalizedScore = totalScore / queryTerms.length;
    const titleMatch = queryTerms.some(term => 
      item.title.toLowerCase().includes(term)
    );
    const finalScore = titleMatch ? normalizedScore * 1.2 : normalizedScore;
    
    return {
      ...item,
      score: Math.min(finalScore, 1.0),
      matchedTerms
    };
  }

  private normalizeText(text: string): string {
    return text.toLowerCase().trim();
  }

  private tokenize(text: string): string[] {
    return this.normalizeText(text)
      .split(/[\s\-_.,()]+/)
      .filter(token => token.length > 0);
  }

  private generateNgrams(text: string, n: number): string[] {
    const normalized = this.normalizeText(text);
    const ngrams: string[] = [];
    
    for (let i = 0; i <= normalized.length - n; i++) {
      ngrams.push(normalized.slice(i, i + n));
    }
    
    return ngrams;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;
    
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - (matrix[str2.length][str1.length] / maxLength);
  }
}

// Global worker search index
const workerIndex = new WorkerSearchIndex();

// Handle messages from main thread
self.onmessage = (event: MessageEvent<SearchWorkerMessage>) => {
  const { type, payload, id } = event.data;

  try {
    switch (type) {
      case 'BUILD_INDEX': {
        const { items } = payload;
        workerIndex.clear();
        if (items) {
          workerIndex.addItems(items);
        }
        
        const response: SearchWorkerResponse = {
          type: 'INDEX_BUILT',
          payload: { success: true },
          id
        };
        self.postMessage(response);
        break;
      }

      case 'SEARCH': {
        const { query, options } = payload;
        const results = workerIndex.search(query || '', options);
        
        const response: SearchWorkerResponse = {
          type: 'SEARCH_RESULT',
          payload: { results },
          id
        };
        self.postMessage(response);
        break;
      }

      case 'GET_SUGGESTIONS': {
        const { query, limit } = payload;
        const suggestions = workerIndex.getSuggestions(query || '', limit);
        
        const response: SearchWorkerResponse = {
          type: 'SUGGESTIONS',
          payload: { suggestions },
          id
        };
        self.postMessage(response);
        break;
      }

      case 'CLEAR_INDEX': {
        workerIndex.clear();
        
        const response: SearchWorkerResponse = {
          type: 'INDEX_CLEARED',
          payload: { success: true },
          id
        };
        self.postMessage(response);
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    const response: SearchWorkerResponse = {
      type: 'ERROR',
      payload: { 
        error: error instanceof Error ? error.message : 'Unknown error',
        originalType: type
      },
      id
    };
    self.postMessage(response);
  }
};

// Export types for TypeScript
export type { SearchWorkerMessage, SearchWorkerResponse };