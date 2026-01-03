# Layout Standards

**Version:** 1.0.0
**Last Updated:** 2025-11-07
**Status:** ✅ All pages compliant

This document defines the pixel-perfect layout standards for myK9Q to ensure consistency across all pages and prevent future layout drift.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Spacing Standards](#spacing-standards)
3. [Page Header Pattern](#page-header-pattern)
4. [Page Container Pattern](#page-container-pattern)
5. [Component Positioning](#component-positioning)
6. [Checklist for New Pages](#checklist-for-new-pages)
7. [Common Violations](#common-violations)

---

## Core Principles

### 1. Mobile-First Design
- **Base styles** = mobile (< 1024px) - NO media query wrapper
- **Desktop styles** = `@media (min-width: 1024px)`
- Tablet users (640px-1023px) receive mobile styles (PRIMARY USER GROUP)

### 2. Full-Width Everywhere
- ❌ **NEVER** use `max-width: 1200px` or similar constraints
- ✅ **ALWAYS** use full viewport width with proper padding
- Individual components (grids, cards) handle wide screens via responsive layouts

### 3. Consistent Horizontal Padding
- Mobile: `var(--token-space-lg)` = **12px**
- Desktop: `var(--token-space-3xl)` = **24px**
- ALL sections must align to these edges (flush with padding)

### 4. Zero Custom Positioning Hacks
- ❌ No absolute positioning for centering titles
- ❌ No negative margins to compensate
- ❌ No hardcoded pixel values
- ✅ Use flexbox with proper gap and alignment

---

## Spacing Standards

### Design Token Reference

```css
/* Use ONLY these spacing values */
--token-space-xs: 0.125rem;   /* 2px */
--token-space-sm: 0.25rem;    /* 4px */
--token-space-md: 0.5rem;     /* 8px */
--token-space-lg: 0.75rem;    /* 12px - MOBILE HORIZONTAL PADDING */
--token-space-xl: 1rem;       /* 16px */
--token-space-2xl: 1.25rem;   /* 20px */
--token-space-3xl: 1.5rem;    /* 24px - DESKTOP HORIZONTAL PADDING */
--token-space-4xl: 2rem;      /* 32px */
```

### Forbidden Patterns

```css
/* ❌ NEVER DO THIS */
.container {
  padding: 12px;              /* Hardcoded spacing */
  max-width: 1200px;          /* Width constraint */
  margin-left: -16px;         /* Negative margin hack */
}

.title {
  position: absolute;         /* Absolute positioning for centering */
  left: 50%;
  transform: translateX(-50%);
}

/* ✅ ALWAYS DO THIS */
.container {
  padding: var(--token-space-xl) var(--token-space-lg);  /* Mobile-first */
}

@media (min-width: 1024px) {
  .container {
    padding: var(--token-space-xl) var(--token-space-3xl);  /* Desktop */
  }
}

.header {
  display: flex;
  align-items: center;
  gap: var(--token-space-xl);
}
```

---

## Page Header Pattern

**Standard Class:** `.page-header`
**Defined in:** `src/styles/page-container.css`

### Structure

```tsx
<header className="page-header">
  <HamburgerMenu />
  <h1>Page Title</h1>
  {/* Optional: filters, actions, etc. */}
</header>
```

### CSS Implementation

```css
.page-header {
  position: sticky;
  top: 0;
  z-index: 1000;
  backdrop-filter: blur(20px);
  background: rgba(255, 255, 255, 0.8);
  border-bottom: 1px solid var(--border);
  padding: var(--token-space-sm) var(--token-space-lg);  /* Mobile: 12px horizontal */
  display: flex;
  align-items: center;
  gap: var(--token-space-xl);  /* 16px gap between hamburger and title */
  min-height: 44px;
}

@media (min-width: 1024px) {
  .page-header {
    padding: var(--token-space-sm) var(--token-space-3xl);  /* Desktop: 24px horizontal */
  }
}
```

### Hamburger Menu Positioning

- **Position:** Flush with left edge (12px mobile, 24px desktop)
- **Method:** Flexbox with gap (no margins on h1)
- **Result:** Hamburger at exact same position on ALL pages

### Title Positioning

```css
/* ✅ CORRECT: Title styling */
.page-header h1 {
  margin: 0;  /* Remove default margin */
  flex: 1;    /* Take remaining space */
  font-size: 1.25rem;
  font-weight: 650;
}

/* ❌ WRONG: Custom positioning */
.page-header h1 {
  margin-left: 16px;           /* Creates double-spacing */
  position: absolute;          /* Absolute positioning */
  left: 50%;                   /* Centering hack */
}
```

### Page-Specific Header Variants

**It's OK to add page-specific classes alongside `page-header`:**

```tsx
// ✅ CORRECT
<header className="page-header scoresheet-header">

// ✅ CORRECT
<header className="page-header entry-list-header">

// ❌ WRONG (missing base class)
<header className="scoresheet-header">
```

**Page-specific CSS should only add non-conflicting styles:**

```css
/* ✅ CORRECT: Additive styles */
.scoresheet-header {
  /* Additional scoresheet-specific styles */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* ❌ WRONG: Overriding standard spacing */
.scoresheet-header {
  padding: 8px 20px;  /* Violates standard padding */
}
```

---

## Page Container Pattern

**Standard Class:** `.page-container`
**Defined in:** `src/styles/page-container.css`

### Full-Width Pattern

```tsx
<div className="page-container">
  <header className="page-header">...</header>
  <main>
    {/* Content sections */}
  </main>
</div>
```

```css
.page-container {
  width: 100%;
  min-height: 100vh;
  background: var(--background);
  color: var(--foreground);
  padding: var(--token-space-lg) var(--token-space-lg);  /* Mobile: 12px */
  padding-bottom: 4rem;
}

@media (min-width: 1024px) {
  .page-container {
    padding: var(--token-space-lg) var(--token-space-3xl);  /* Desktop: 24px */
  }
}
```

### Scrollable Container Pattern

**For pages with sticky headers (Settings, etc.):**

```tsx
<div className="page-container-scroll">
  <header className="page-header">...</header>
  <div className="page-content">
    {/* Scrollable content */}
  </div>
</div>
```

```css
.page-container-scroll {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.page-container-scroll .page-content {
  flex: 1;
  overflow-y: scroll;
  padding: var(--token-space-lg) var(--token-space-lg);  /* Mobile: 12px */
}

@media (min-width: 1024px) {
  .page-container-scroll .page-content {
    padding: var(--token-space-lg) var(--token-space-3xl);  /* Desktop: 24px */
  }
}
```

---

## Component Positioning

### Horizontal Alignment

**ALL content sections must align to the same horizontal padding:**

```css
/* ✅ CORRECT: Aligned sections */
.stats-cards {
  padding: var(--token-space-3xl);  /* Includes horizontal padding */
}

.stats-section {
  padding: var(--token-space-3xl);  /* Same horizontal alignment */
}

/* ❌ WRONG: Misaligned sections */
.stats-cards {
  padding: var(--token-space-3xl);
  max-width: 1200px;  /* VIOLATION: Creates centered narrow column */
  margin: 0 auto;     /* VIOLATION: Centers content */
}
```

### Vertical Spacing

Use consistent vertical gaps between sections:

```css
.page-section + .page-section {
  margin-top: var(--token-space-4xl);  /* 32px between major sections */
}
```

### Cards and Grids

Let component grids handle wide screens:

```css
/* ✅ CORRECT: Responsive grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--token-space-2xl);
}

/* ❌ WRONG: Fixed grid with max-width */
.stats-grid {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}
```

---

## Checklist for New Pages

When creating a new page, ensure:

- [ ] Uses `className="page-header"` for header
- [ ] Header h1 has `margin: 0` (no custom margins)
- [ ] Uses `className="page-container"` or `page-container-scroll`
- [ ] Mobile padding: `var(--token-space-lg)` (12px horizontal)
- [ ] Desktop media query: `@media (min-width: 1024px)`
- [ ] Desktop padding: `var(--token-space-3xl)` (24px horizontal)
- [ ] No `max-width` constraints on main containers
- [ ] No absolute positioning for centering
- [ ] No hardcoded px values for spacing
- [ ] All design tokens use CSS variables
- [ ] Tested at 375px, 768px, 1024px, 1440px widths

---

## Common Violations

### Violation #1: Max-Width Constraints

**Problem:**
```css
.container {
  max-width: 1200px;
  margin: 0 auto;
}
```

**Fix:**
```css
.container {
  /* Remove max-width entirely */
  /* Use full width with proper padding */
}
```

**Example:** Fixed in Stats.css (lines 356, 362, 369)

---

### Violation #2: Custom Mobile Padding

**Problem:**
```css
.settings-content {
  padding: var(--token-space-xl) var(--token-space-3xl);  /* Desktop-first */
}

@media (max-width: 640px) {
  .settings-content {
    padding: var(--token-space-lg) var(--token-space-xl);  /* Wrong mobile value */
  }
}
```

**Fix:**
```css
.settings-content {
  padding: var(--token-space-xl) var(--token-space-lg);  /* Mobile-first: 12px */
}

@media (min-width: 1024px) {
  .settings-content {
    padding: var(--token-space-xl) var(--token-space-3xl);  /* Desktop: 24px */
  }
}
```

**Example:** Fixed in Settings.css (line 20, 944-947)

---

### Violation #3: Absolute Positioning for Centering

**Problem:**
```css
.header h1 {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}
```

**Fix:**
```css
.header {
  display: flex;
  align-items: center;
  gap: var(--token-space-xl);
}

.header h1 {
  margin: 0;
  flex: 1;  /* Take remaining space */
  text-align: center;  /* If centering is needed */
}
```

---

### Violation #4: Hardcoded Pixel Values

**Problem:**
```css
.container {
  padding: 12px 24px;
  gap: 16px;
}
```

**Fix:**
```css
.container {
  padding: var(--token-space-lg) var(--token-space-3xl);
  gap: var(--token-space-xl);
}
```

---

## Testing Matrix

**Test all pages at these breakpoints:**

| Breakpoint | Width | Expected Horizontal Padding |
|------------|-------|----------------------------|
| Mobile (iPhone SE) | 375px | 12px (`var(--token-space-lg)`) |
| Mobile (iPhone 12) | 390px | 12px (`var(--token-space-lg)`) |
| Tablet (iPad Mini) | 768px | 12px (`var(--token-space-lg)`) |
| Tablet (iPad Pro) | 1024px | 24px (`var(--token-space-3xl)`) |
| Desktop | 1440px | 24px (`var(--token-space-3xl)`) |
| Large Desktop | 1920px | 24px (`var(--token-space-3xl)`) |

**Visual Tests:**

1. **Hamburger Menu Position**
   - Must be at EXACT same position on all pages
   - Use browser DevTools to measure pixel distance from left edge
   - Should be 12px on mobile, 24px on desktop

2. **Content Alignment**
   - All sections should align vertically (flush with container padding)
   - No sections should be narrower or wider than others
   - Use vertical ruler in DevTools to verify alignment

3. **Theme Consistency**
   - No flash of unstyled content (FOUC) on page load
   - Theme should be applied before first paint
   - Test by hard refreshing multiple times

---

## Compliance Status

**Last Audit:** 2025-11-07

| Page | Header | Container | Padding | Status |
|------|--------|-----------|---------|--------|
| Home | ✅ page-header | ✅ page-container | ✅ 12px/24px | **COMPLIANT** |
| ClassList | ✅ page-header | ✅ page-container | ✅ 12px/24px | **COMPLIANT** |
| EntryList | ✅ page-header | ✅ page-container | ✅ 12px/24px | **COMPLIANT** |
| CombinedEntryList | ✅ page-header | ✅ page-container | ✅ 12px/24px | **COMPLIANT** |
| DogDetails | ✅ page-header | ✅ page-container | ✅ 12px/24px | **COMPLIANT** |
| Stats | ✅ page-header | ✅ page-container | ✅ 12px/24px | **COMPLIANT** (fixed) |
| Settings | ✅ page-header | ✅ page-container-scroll | ✅ 12px/24px | **COMPLIANT** (fixed) |
| Announcements | ✅ page-header | ✅ page-container | ✅ 12px/24px | **COMPLIANT** |
| Scoresheets | ✅ page-header | ✅ Custom | ✅ 12px/24px | **COMPLIANT** |

---

## References

- [page-container.css](../src/styles/page-container.css) - Global container and header patterns
- [design-tokens.css](../src/styles/design-tokens.css) - All spacing and color tokens
- [CSS_ARCHITECTURE.md](CSS_ARCHITECTURE.md) - Overall CSS architecture and patterns

---

## Changelog

### 2025-11-07 - Initial Standards Documentation
- Documented full-width pattern (12px/24px padding)
- Documented page-header standard with flexbox layout
- Fixed Statistics page max-width violations
- Fixed Settings page mobile padding
- All pages now compliant
