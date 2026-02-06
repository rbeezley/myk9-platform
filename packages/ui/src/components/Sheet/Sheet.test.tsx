import { describe, it, expect } from 'vitest';
import {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetBackdrop,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetPortal,
} from './Sheet';

describe('Sheet exports', () => {
  it('should export Sheet', () => {
    expect(Sheet).toBeDefined();
  });

  it('should export SheetTrigger', () => {
    expect(SheetTrigger).toBeDefined();
    expect(SheetTrigger.displayName).toBe('SheetTrigger');
  });

  it('should export SheetClose', () => {
    expect(SheetClose).toBeDefined();
    expect(SheetClose.displayName).toBe('SheetClose');
  });

  it('should export SheetBackdrop', () => {
    expect(SheetBackdrop).toBeDefined();
    expect(SheetBackdrop.displayName).toBe('SheetBackdrop');
  });

  it('should export SheetOverlay as alias for SheetBackdrop', () => {
    expect(SheetOverlay).toBe(SheetBackdrop);
  });

  it('should export SheetContent', () => {
    expect(SheetContent).toBeDefined();
    expect(SheetContent.displayName).toBe('SheetContent');
  });

  it('should export SheetHeader', () => {
    expect(SheetHeader).toBeDefined();
    expect(SheetHeader.displayName).toBe('SheetHeader');
  });

  it('should export SheetBody', () => {
    expect(SheetBody).toBeDefined();
    expect(SheetBody.displayName).toBe('SheetBody');
  });

  it('should export SheetFooter', () => {
    expect(SheetFooter).toBeDefined();
    expect(SheetFooter.displayName).toBe('SheetFooter');
  });

  it('should export SheetTitle', () => {
    expect(SheetTitle).toBeDefined();
    expect(SheetTitle.displayName).toBe('SheetTitle');
  });

  it('should export SheetDescription', () => {
    expect(SheetDescription).toBeDefined();
    expect(SheetDescription.displayName).toBe('SheetDescription');
  });

  it('should export SheetPortal', () => {
    expect(SheetPortal).toBeDefined();
  });
});
