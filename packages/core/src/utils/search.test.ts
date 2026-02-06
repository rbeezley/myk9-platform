import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  matchesSearch,
  matchesAny,
  createSearchFilter,
  filterBySearchTerm,
  normalizeSearchTerm,
  createDebouncedSearch,
} from './search';

describe('matchesSearch', () => {
  it('should match case-insensitively', () => {
    expect(matchesSearch('Hello World', 'hello')).toBe(true);
  });

  it('should match uppercase search against lowercase text', () => {
    expect(matchesSearch('hello world', 'WORLD')).toBe(true);
  });

  it('should return false when no match', () => {
    expect(matchesSearch('Hello World', 'foo')).toBe(false);
  });

  it('should return true for empty search term', () => {
    expect(matchesSearch('Hello World', '')).toBe(true);
  });

  it('should return false for null text', () => {
    expect(matchesSearch(null, 'test')).toBe(false);
  });

  it('should return false for undefined text', () => {
    expect(matchesSearch(undefined, 'test')).toBe(false);
  });

  it('should return true for null text with empty search', () => {
    expect(matchesSearch(null, '')).toBe(false);
  });

  it('should match partial strings', () => {
    expect(matchesSearch('Golden Retriever', 'ret')).toBe(true);
  });
});

describe('matchesAny', () => {
  it('should return true if any value matches', () => {
    expect(matchesAny(['John', 'Doe', 'john@example.com'], 'john')).toBe(true);
  });

  it('should return false if no values match', () => {
    expect(matchesAny(['Hello', 'World'], 'foo')).toBe(false);
  });

  it('should return true for empty search term', () => {
    expect(matchesAny(['Hello', 'World'], '')).toBe(true);
  });

  it('should handle null values in the array', () => {
    expect(matchesAny([null, 'Hello', undefined], 'hello')).toBe(true);
  });

  it('should return false when all values are null/undefined', () => {
    expect(matchesAny([null, undefined], 'test')).toBe(false);
  });

  it('should match case-insensitively', () => {
    expect(matchesAny(['UPPERCASE', 'lowercase'], 'Upper')).toBe(true);
  });

  it('should handle empty array with non-empty search', () => {
    expect(matchesAny([], 'test')).toBe(false);
  });

  it('should handle empty array with empty search', () => {
    expect(matchesAny([], '')).toBe(true);
  });
});

describe('createSearchFilter', () => {
  type Dog = {
    name: string;
    breed: string;
    age: number;
  };

  const dogs: Dog[] = [
    { name: 'Buddy', breed: 'Golden Retriever', age: 3 },
    { name: 'Max', breed: 'German Shepherd', age: 5 },
    { name: 'Luna', breed: 'Golden Doodle', age: 2 },
  ];

  it('should filter by matching field', () => {
    const filter = createSearchFilter<Dog>('golden', ['name', 'breed']);
    const result = dogs.filter(filter);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('Buddy');
    expect(result[1]!.name).toBe('Luna');
  });

  it('should return all items for empty search', () => {
    const filter = createSearchFilter<Dog>('', ['name', 'breed']);
    const result = dogs.filter(filter);
    expect(result).toHaveLength(3);
  });

  it('should match against numeric fields converted to string', () => {
    const filter = createSearchFilter<Dog>('5', ['age']);
    const result = dogs.filter(filter);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Max');
  });

  it('should return empty array when nothing matches', () => {
    const filter = createSearchFilter<Dog>('poodle', ['name', 'breed']);
    const result = dogs.filter(filter);
    expect(result).toHaveLength(0);
  });

  it('should handle null field values', () => {
    const items = [{ name: null as unknown as string, breed: 'Lab' }];
    const filter = createSearchFilter('lab', ['name', 'breed']);
    const result = items.filter(filter);
    expect(result).toHaveLength(1);
  });
});

describe('filterBySearchTerm', () => {
  const users = [
    { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
    { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
    { firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com' },
  ];

  it('should filter by matching field', () => {
    const result = filterBySearchTerm(users, 'john', ['firstName', 'lastName', 'email']);
    expect(result).toHaveLength(2); // John Doe and Bob Johnson
  });

  it('should return all items for empty search', () => {
    const result = filterBySearchTerm(users, '', ['firstName']);
    expect(result).toHaveLength(3);
  });

  it('should search across multiple fields', () => {
    const result = filterBySearchTerm(users, 'jane', ['firstName', 'email']);
    expect(result).toHaveLength(1);
    expect(result[0]!.firstName).toBe('Jane');
  });

  it('should return empty array when nothing matches', () => {
    const result = filterBySearchTerm(users, 'xyz', ['firstName', 'lastName']);
    expect(result).toHaveLength(0);
  });
});

describe('normalizeSearchTerm', () => {
  it('should trim and lowercase', () => {
    expect(normalizeSearchTerm('  Hello World  ')).toBe('hello world');
  });

  it('should return empty string for empty input', () => {
    expect(normalizeSearchTerm('')).toBe('');
  });

  it('should return empty string for null', () => {
    expect(normalizeSearchTerm(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(normalizeSearchTerm(undefined)).toBe('');
  });

  it('should handle already lowercase trimmed input', () => {
    expect(normalizeSearchTerm('hello')).toBe('hello');
  });
});

describe('createDebouncedSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call the callback after the delay', () => {
    const callback = vi.fn();
    const debounced = createDebouncedSearch(callback, 300);

    debounced('test');
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(callback).toHaveBeenCalledWith('test');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should reset timer on rapid calls', () => {
    const callback = vi.fn();
    const debounced = createDebouncedSearch(callback, 300);

    debounced('a');
    vi.advanceTimersByTime(100);
    debounced('ab');
    vi.advanceTimersByTime(100);
    debounced('abc');
    vi.advanceTimersByTime(300);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('abc');
  });

  it('should use default delay of 300ms', () => {
    const callback = vi.fn();
    const debounced = createDebouncedSearch(callback);

    debounced('test');
    vi.advanceTimersByTime(299);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledWith('test');
  });

  it('should allow multiple separate invocations', () => {
    const callback = vi.fn();
    const debounced = createDebouncedSearch(callback, 100);

    debounced('first');
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledWith('first');

    debounced('second');
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledWith('second');
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
