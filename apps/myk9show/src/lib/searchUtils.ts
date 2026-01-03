/**
 * Enhanced search utilities with fuzzy matching and highlighting
 */

export interface SearchResult<T> {
  item: T;
  score: number;
  matches: SearchMatch[];
}

export interface SearchMatch {
  field: string;
  text: string;
  indices: [number, number][];
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i += 1) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= b.length; j += 1) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-1, higher is better)
 */
function calculateSimilarity(query: string, text: string): number {
  if (query.length === 0) return 1;
  if (text.length === 0) return 0;
  
  const distance = levenshteinDistance(query.toLowerCase(), text.toLowerCase());
  const maxLength = Math.max(query.length, text.length);
  return 1 - (distance / maxLength);
}

/**
 * Find all occurrences of query in text (case-insensitive)
 */
function findMatches(query: string, text: string): [number, number][] {
  const matches: [number, number][] = [];
  if (!query || !text) return matches;
  
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  let startIndex = 0;
  
  while (startIndex < lowerText.length) {
    const index = lowerText.indexOf(lowerQuery, startIndex);
    if (index === -1) break;
    matches.push([index, index + query.length]);
    startIndex = index + 1;
  }
  
  return matches;
}

/**
 * Enhanced search function with fuzzy matching and scoring
 */
export function enhancedSearch<T>(
  items: T[],
  query: string,
  getSearchFields: (item: T) => Record<string, string>,
  options: {
    threshold?: number; // Minimum similarity score (0-1)
    maxResults?: number;
    fuzzyEnabled?: boolean;
  } = {}
): SearchResult<T>[] {
  const {
    threshold = 0.3,
    maxResults = 50,
    fuzzyEnabled = true
  } = options;

  if (!query.trim()) {
    return items.map(item => ({
      item,
      score: 1,
      matches: []
    }));
  }

  const results: SearchResult<T>[] = [];
  const lowerQuery = query.toLowerCase().trim();
  const queryWords = lowerQuery.split(/\s+/);

  for (const item of items) {
    const fields = getSearchFields(item);
    let totalScore = 0;
    let matchCount = 0;
    const matches: SearchMatch[] = [];

    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      if (!fieldValue) continue;

      const lowerFieldValue = fieldValue.toLowerCase();
      let fieldScore = 0;
      let fieldMatches: [number, number][] = [];

      // Exact phrase match (highest score)
      if (lowerFieldValue.includes(lowerQuery)) {
        fieldScore = 1.0;
        fieldMatches = findMatches(lowerQuery, fieldValue);
      }
      // Word-by-word matching
      else {
        const wordScores: number[] = [];
        for (const word of queryWords) {
          if (lowerFieldValue.includes(word)) {
            wordScores.push(1.0);
            fieldMatches.push(...findMatches(word, fieldValue));
          } else if (fuzzyEnabled) {
            // Fuzzy matching for individual words
            const words = lowerFieldValue.split(/\s+/);
            let bestWordScore = 0;
            for (const fieldWord of words) {
              const similarity = calculateSimilarity(word, fieldWord);
              if (similarity > bestWordScore) {
                bestWordScore = similarity;
              }
            }
            if (bestWordScore >= threshold) {
              wordScores.push(bestWordScore);
            }
          }
        }
        if (wordScores.length > 0) {
          fieldScore = wordScores.reduce((a, b) => a + b, 0) / queryWords.length;
        }
      }

      if (fieldScore > 0) {
        totalScore += fieldScore;
        matchCount++;
        
        if (fieldMatches.length > 0) {
          matches.push({
            field: fieldName,
            text: fieldValue,
            indices: fieldMatches
          });
        }
      }
    }

    if (matchCount > 0) {
      const averageScore = totalScore / matchCount;
      if (averageScore >= threshold) {
        results.push({
          item,
          score: averageScore,
          matches
        });
      }
    }
  }

  // Sort by score (highest first) and limit results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

export interface HighlightSegment {
  text: string;
  isHighlighted: boolean;
}

/**
 * Highlight matching text in a string
 */
export function highlightMatches(
  text: string,
  matches: [number, number][]
): HighlightSegment[] {
  if (!matches.length) return [{ text, isHighlighted: false }];

  const segments: HighlightSegment[] = [];
  let lastIndex = 0;

  // Merge overlapping matches
  const mergedMatches = mergeOverlappingRanges(matches);

  for (let i = 0; i < mergedMatches.length; i++) {
    const [start, end] = mergedMatches[i];
    
    // Add text before match
    if (start > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, start),
        isHighlighted: false
      });
    }
    
    // Add highlighted match
    segments.push({
      text: text.slice(start, end),
      isHighlighted: true
    });
    
    lastIndex = end;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isHighlighted: false
    });
  }
  
  return segments;
}

/**
 * Merge overlapping ranges
 */
function mergeOverlappingRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length <= 1) return ranges;
  
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    
    if (current[0] <= last[1]) {
      // Overlapping ranges, merge them
      last[1] = Math.max(last[1], current[1]);
    } else {
      // Non-overlapping, add new range
      merged.push(current);
    }
  }
  
  return merged;
}