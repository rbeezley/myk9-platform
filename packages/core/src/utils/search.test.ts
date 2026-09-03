import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { matchesSearch, matchesAny, createDebouncedSearch } from './search';

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
