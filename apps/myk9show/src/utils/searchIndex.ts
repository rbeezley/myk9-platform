/**
 * High-performance client-side search index
 * Supports fuzzy search, ranking, and fast lookups for thousands of records
 */

export interface SearchableItem {
  id: string;
  type: 'dog' | 'person' | 'show' | 'club';
  title: string;
  subtitle?: string;
  searchText: string; // Combined searchable text
  metadata: Record<string, unknown>;
  route: string;
}

export interface SearchResult extends SearchableItem {
  score: number;
  matchedTerms: string[];
  snippet?: string;
}

export interface SearchOptions {
  maxResults?: number;
  fuzzyThreshold?: number;
  categories?: Array<'dog' | 'person' | 'show' | 'club'>;
  minScore?: number;
}

class SearchIndex {
  private items: Map<string, SearchableItem> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private ngramIndex: Map<string, Set<string>> = new Map();
  private ready = false;

  /**
   * Add items to the search index
   */
  addItems(items: SearchableItem[]): void {
    items.forEach(item => this.addItem(item));
    this.ready = true;
  }

  /**
   * Add a single item to the index
   */
  addItem(item: SearchableItem): void {
    this.items.set(item.id, item);
    this.indexItem(item);
  }

  /**
   * Remove an item from the index
   */
  removeItem(id: string): void {
    const item = this.items.get(id);
    if (item) {
      this.items.delete(id);
      this.removeFromIndex(item);
    }
  }

  /**
   * Update an item in the index
   */
  updateItem(item: SearchableItem): void {
    this.removeItem(item.id);
    this.addItem(item);
  }

  /**
   * Search the index
   */
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
    
    // Debug logging for "Coop" searches
    if (query.toLowerCase().includes('coop')) {
      console.log('🔍 Debugging search for:', query);
      console.log('🔤 Query terms:', queryTerms);
      console.log('📋 All items in index:', Array.from(this.items.keys()));
      
      // Find Cooper specifically
      const cooperItem = Array.from(this.items.values()).find(item => 
        item.title.toLowerCase().includes('cooper') || 
        item.searchText.toLowerCase().includes('cooper')
      );
      if (cooperItem) {
        console.log('🐕 Found Cooper item:', {
          id: cooperItem.id,
          title: cooperItem.title,
          searchText: cooperItem.searchText,
          tokens: this.tokenize(cooperItem.searchText)
        });
      } else {
        console.log('❌ Cooper not found in items');
      }
    }
    
    // Find candidate items
    const candidates = this.findCandidates(queryTerms);
    
    // Score and rank results
    const scoredResults: SearchResult[] = [];
    
    for (const itemId of candidates) {
      const item = this.items.get(itemId);
      if (!item) continue;
      
      // Filter by category if specified
      if (categories.length > 0 && !categories.includes(item.type)) {
        continue;
      }
      
      const result = this.scoreItem(item, queryTerms, fuzzyThreshold);
      if (result.score >= minScore) {
        scoredResults.push(result);
      }
    }
    
    // Sort by score (descending) and return top results
    return scoredResults
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  /**
   * Get search suggestions based on partial input
   */
  getSuggestions(partialQuery: string, limit = 5): string[] {
    const normalized = this.normalizeText(partialQuery);
    const suggestions = new Set<string>();
    
    // Find terms that start with the partial query
    for (const [term] of this.invertedIndex) {
      if (term.startsWith(normalized) && term !== normalized) {
        suggestions.add(term);
        if (suggestions.size >= limit) break;
      }
    }
    
    return Array.from(suggestions);
  }

  /**
   * Check if index is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Get index statistics
   */
  getStats() {
    return {
      totalItems: this.items.size,
      indexedTerms: this.invertedIndex.size,
      ngramTerms: this.ngramIndex.size,
      ready: this.ready
    };
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.items.clear();
    this.invertedIndex.clear();
    this.ngramIndex.clear();
    this.ready = false;
  }

  // Private methods

  private indexItem(item: SearchableItem): void {
    const tokens = this.tokenize(item.searchText);
    
    // Add to inverted index
    tokens.forEach(token => {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set());
      }
      this.invertedIndex.get(token)!.add(item.id);
    });
    
    // Add to n-gram index for fuzzy search
    const ngrams = this.generateNgrams(item.searchText, 2);
    ngrams.forEach(ngram => {
      if (!this.ngramIndex.has(ngram)) {
        this.ngramIndex.set(ngram, new Set());
      }
      this.ngramIndex.get(ngram)!.add(item.id);
    });
  }

  private removeFromIndex(item: SearchableItem): void {
    const tokens = this.tokenize(item.searchText);
    
    // Remove from inverted index
    tokens.forEach(token => {
      const itemSet = this.invertedIndex.get(token);
      if (itemSet) {
        itemSet.delete(item.id);
        if (itemSet.size === 0) {
          this.invertedIndex.delete(token);
        }
      }
    });
    
    // Remove from n-gram index
    const ngrams = this.generateNgrams(item.searchText, 2);
    ngrams.forEach(ngram => {
      const itemSet = this.ngramIndex.get(ngram);
      if (itemSet) {
        itemSet.delete(item.id);
        if (itemSet.size === 0) {
          this.ngramIndex.delete(ngram);
        }
      }
    });
  }

  private findCandidates(queryTerms: string[]): Set<string> {
    const candidates = new Set<string>();
    
    // Debug logging for "coop" searches
    const isCoopSearch = queryTerms.some(term => term.includes('coop'));
    if (isCoopSearch) {
      console.log('🔍 findCandidates for:', queryTerms);
      console.log('📚 Inverted index keys:', Array.from(this.invertedIndex.keys()).slice(0, 20));
      
      // Check if "cooper" is in the inverted index
      const cooperInIndex = this.invertedIndex.get('cooper');
      console.log('🔎 "cooper" in inverted index:', cooperInIndex ? Array.from(cooperInIndex) : 'NOT FOUND');
    }
    
    // Exact matches first
    queryTerms.forEach(term => {
      const exactMatches = this.invertedIndex.get(term);
      if (exactMatches) {
        exactMatches.forEach(id => candidates.add(id));
      }
      if (isCoopSearch) {
        console.log(`🎯 Exact matches for "${term}":`, exactMatches ? Array.from(exactMatches) : 'none');
      }
    });
    
    // Fuzzy matches using n-grams
    queryTerms.forEach(term => {
      const ngrams = this.generateNgrams(term, 2);
      if (isCoopSearch) {
        console.log(`🔤 N-grams for "${term}":`, ngrams);
      }
      ngrams.forEach(ngram => {
        const matches = this.ngramIndex.get(ngram);
        if (matches) {
          matches.forEach(id => candidates.add(id));
        }
        if (isCoopSearch && matches) {
          console.log(`📝 N-gram "${ngram}" matches:`, Array.from(matches));
        }
      });
    });
    
    if (isCoopSearch) {
      console.log('🎯 Final candidates:', Array.from(candidates));
    }
    
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
        // Exact match
        if (itemToken === queryTerm) {
          bestMatch = Math.max(bestMatch, 1.0);
          bestMatchTerm = itemToken;
        }
        // Prefix match (both directions)
        else if (itemToken.startsWith(queryTerm) || queryTerm.startsWith(itemToken)) {
          bestMatch = Math.max(bestMatch, 0.8);
          bestMatchTerm = itemToken;
        }
        // Substring match (case insensitive)
        else if (itemToken.includes(queryTerm) || queryTerm.includes(itemToken)) {
          bestMatch = Math.max(bestMatch, 0.7);
          bestMatchTerm = itemToken;
        }
        // Fuzzy match
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
    
    // Normalize score
    const normalizedScore = totalScore / queryTerms.length;
    
    // Boost score for title matches
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
    
    // Use Levenshtein distance for similarity
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

// Global search index instance
export const globalSearchIndex = new SearchIndex();

// Helper function to create searchable items from data
export function createSearchableItem(
  type: SearchableItem['type'],
  data: Record<string, unknown>
): SearchableItem {
  switch (type) {
    case 'dog':
      return {
        id: `dog-${data.id}`,
        type: 'dog',
        title: String(data.callName || data.name || ''),
        subtitle: `${data.breed} • ${data.gender || ''}`,
        searchText: [
          data.name,
          data.callName,
          data.breed,
          data.color,
          data.gender,
          // Include registration numbers from registrations array
          ...(data.registrations as Array<{ registrationNumber?: string }> || []).map((reg) => reg.registrationNumber)
        ].filter(Boolean).join(' '),
        metadata: data,
        route: `/dogs/${data.id}`
      };
      
    case 'person':
      return {
        id: `person-${data.id}`,
        type: 'person',
        title: `${String(data.firstName || '')} ${String(data.lastName || '')}`,
        subtitle: String(data.email || 'User'),
        searchText: [
          data.firstName,
          data.lastName,
          data.email,
          data.phone
        ].filter(Boolean).join(' '),
        metadata: data,
        route: `/people/${data.id}`
      };
      
    case 'show':
      return {
        id: `show-${data.id}`,
        type: 'show',
        title: String(data.name || ''),
        subtitle: `${data.location} • ${data.type}`,
        searchText: [
          data.name,
          data.location,
          data.type,
          data.clubName
        ].filter(Boolean).join(' '),
        metadata: data,
        route: `/shows/${data.id}`
      };
      
    case 'club':
      return {
        id: `club-${data.id}`,
        type: 'club',
        title: String(data.name || ''),
        subtitle: String(data.location || 'Club'),
        searchText: [
          data.name,
          data.location,
          data.abbreviation
        ].filter(Boolean).join(' '),
        metadata: data,
        route: `/clubs/${data.id}`
      };
      
    default:
      throw new Error(`Unknown searchable item type: ${type}`);
  }
}