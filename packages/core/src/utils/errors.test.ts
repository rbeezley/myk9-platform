import { describe, it, expect } from 'vitest';
import { ensureError, isErrorLike, getErrorMessage } from './errors';

describe('ensureError', () => {
  it('should return the same Error if given an Error', () => {
    const err = new Error('test');
    const result = ensureError(err);
    expect(result).toBe(err);
    expect(result.message).toBe('test');
  });

  it('should wrap a string in an Error', () => {
    const result = ensureError('string error');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('string error');
  });

  it('should create Error from object with message property', () => {
    const result = ensureError({ message: 'obj error' });
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('obj error');
  });

  it('should preserve name from object with name and message', () => {
    const result = ensureError({ message: 'custom', name: 'CustomError' });
    expect(result.message).toBe('custom');
    expect(result.name).toBe('CustomError');
  });

  it('should not set name from non-string name property', () => {
    const result = ensureError({ message: 'test', name: 123 });
    expect(result.message).toBe('test');
    expect(result.name).toBe('Error'); // default Error name
  });

  it('should stringify numbers', () => {
    const result = ensureError(42);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('42');
  });

  it('should stringify null', () => {
    const result = ensureError(null);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('null');
  });

  it('should stringify undefined', () => {
    const result = ensureError(undefined);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('undefined');
  });

  it('should stringify boolean', () => {
    const result = ensureError(false);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('false');
  });

  it('should handle object without message property', () => {
    const result = ensureError({ code: 'ERR_FAILED' });
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('[object Object]');
  });

  it('should return Error subclass instances as-is', () => {
    const err = new TypeError('type error');
    const result = ensureError(err);
    expect(result).toBe(err);
    expect(result).toBeInstanceOf(TypeError);
  });
});

describe('isErrorLike', () => {
  it('should return true for Error instances', () => {
    expect(isErrorLike(new Error('test'))).toBe(true);
  });

  it('should return true for objects with message string', () => {
    expect(isErrorLike({ message: 'test' })).toBe(true);
  });

  it('should return true for objects with message, name, and stack', () => {
    expect(isErrorLike({ message: 'test', name: 'Err', stack: 'stack...' })).toBe(true);
  });

  it('should return false for null', () => {
    expect(isErrorLike(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isErrorLike(undefined)).toBe(false);
  });

  it('should return false for strings', () => {
    expect(isErrorLike('error string')).toBe(false);
  });

  it('should return false for numbers', () => {
    expect(isErrorLike(42)).toBe(false);
  });

  it('should return false for objects without message', () => {
    expect(isErrorLike({ code: 'ERR' })).toBe(false);
  });

  it('should return false for objects with non-string message', () => {
    expect(isErrorLike({ message: 123 })).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('should extract message from Error', () => {
    expect(getErrorMessage(new Error('test error'))).toBe('test error');
  });

  it('should return string directly', () => {
    expect(getErrorMessage('string error')).toBe('string error');
  });

  it('should extract message from error-like object', () => {
    expect(getErrorMessage({ message: 'obj error' })).toBe('obj error');
  });

  it('should stringify numbers', () => {
    expect(getErrorMessage(42)).toBe('42');
  });

  it('should stringify null', () => {
    expect(getErrorMessage(null)).toBe('null');
  });

  it('should stringify undefined', () => {
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('should stringify boolean', () => {
    expect(getErrorMessage(true)).toBe('true');
  });

  it('should return empty string for empty string input', () => {
    expect(getErrorMessage('')).toBe('');
  });
});
