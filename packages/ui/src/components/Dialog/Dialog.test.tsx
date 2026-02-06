import { describe, it, expect } from 'vitest';
import {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogBackdrop,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogPortal,
} from './Dialog';

describe('Dialog exports', () => {
  it('should export Dialog', () => {
    expect(Dialog).toBeDefined();
  });

  it('should export DialogTrigger', () => {
    expect(DialogTrigger).toBeDefined();
    expect(DialogTrigger.displayName).toBe('DialogTrigger');
  });

  it('should export DialogClose', () => {
    expect(DialogClose).toBeDefined();
    expect(DialogClose.displayName).toBe('DialogClose');
  });

  it('should export DialogBackdrop', () => {
    expect(DialogBackdrop).toBeDefined();
    expect(DialogBackdrop.displayName).toBe('DialogBackdrop');
  });

  it('should export DialogOverlay as alias for DialogBackdrop', () => {
    expect(DialogOverlay).toBe(DialogBackdrop);
  });

  it('should export DialogContent', () => {
    expect(DialogContent).toBeDefined();
    expect(DialogContent.displayName).toBe('DialogContent');
  });

  it('should export DialogHeader', () => {
    expect(DialogHeader).toBeDefined();
    expect(DialogHeader.displayName).toBe('DialogHeader');
  });

  it('should export DialogFooter', () => {
    expect(DialogFooter).toBeDefined();
    expect(DialogFooter.displayName).toBe('DialogFooter');
  });

  it('should export DialogTitle', () => {
    expect(DialogTitle).toBeDefined();
    expect(DialogTitle.displayName).toBe('DialogTitle');
  });

  it('should export DialogDescription', () => {
    expect(DialogDescription).toBeDefined();
    expect(DialogDescription.displayName).toBe('DialogDescription');
  });

  it('should export DialogPortal', () => {
    expect(DialogPortal).toBeDefined();
  });
});
