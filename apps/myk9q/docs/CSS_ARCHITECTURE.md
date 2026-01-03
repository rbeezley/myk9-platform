# CSS Architecture & Styling Guidelines

## Table of Contents
1. [Design System Overview](#design-system-overview)
2. [CSS Variable Standards](#css-variable-standards)
3. [Component Layout Patterns](#component-layout-patterns)
4. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
5. [Testing Guidelines](#testing-guidelines)

---

## Design System Overview

### Core Principles
1. **Mobile-First Responsive**: Design for mobile, enhance for desktop
2. **Apple-Inspired Design**: Clean, minimal, with attention to spacing and typography
3. **Outdoor Visibility**: High contrast, large touch targets (44px+), readable in sunlight
4. **Status-Driven Colors**: Visual indicators using consistent color palette

### File Structure
```
src/
├── index.css                    # Global styles, CSS variables
├── pages/
│   ├── Home/Home.css           # Home page specific styles
│   ├── DogDetails/DogDetails.css   # Dog details page styles
│   └── EntryList/EntryList.css     # Entry list page styles
└── components/
    └── ui/                      # Reusable UI component styles
```

---

## CSS Variable Standards

### Status Colors
**ALWAYS use CSS variables for status colors** - never hardcode hex values:

```css
/* ✅ CORRECT */
.status-badge {
  background: var(--status-checked-in, #10b981);
  border-color: var(--status-checked-in, #10b981);
}

/* ❌ WRONG */
.status-badge {
  background: #10b981;
}
```

### Available Status Variables
```css
--status-not-checked-in: #6b7280 (gray)
--status-checked-in: #10b981 (green)
--status-at-gate: #8b5cf6 (purple)
--status-in-ring: #3b82f6 (blue)
--status-conflict: #f59e0b (amber)
--status-pulled: #ef4444 (red)
--status-done: #10b981 (green)
```

### Theme Variables
```css
--background: Card/page background
--foreground: Primary text color
--card: Card background
--border: Border color
--muted: Muted background
--primary: Primary action color
```

---

## Component Layout Patterns

### Card Layout Pattern

#### Basic Structure
```tsx
<div className="card-container">
  <div className="card-content">
    <div className="card-left">
      {/* Position badge, icon, etc. */}
    </div>
    <div className="card-middle">
      {/* Main content */}
    </div>
    <div className="card-right">
      {/* Actions, status buttons */}
    </div>
  </div>
</div>
```

#### CSS Best Practices
```css
/* Container with proper spacing */
.card-container {
  position: relative;  /* For absolute positioned children */
  padding: 0.875rem 1rem;  /* Consistent padding */
  border-radius: 16px;  /* Standard rounded corners */
  border: 1px solid var(--border);
  border-left: 4px solid var(--status-color);  /* Accent border */
  overflow: hidden;  /* Keep rounded corners clean */
}

/* Flex layout for content */
.card-content {
  display: flex;
  gap: 0.75rem;  /* Consistent spacing */
  align-items: flex-start;  /* or center, depending on design */
}

/* Left section (fixed width) */
.card-left {
  flex-shrink: 0;
  width: 48px;  /* Fixed size for badges */
}

/* Middle section (grows) */
.card-middle {
  flex: 1;
  min-width: 0;  /* IMPORTANT: Allows text truncation */
}

/* Right section (fixed width) */
.card-right {
  flex-shrink: 0;
}
```

### Status Button Pattern

#### Consistent Sizing
```css
.status-button {
  min-width: 100px;  /* Minimum width */
  height: 44px;  /* Accessibility standard for touch targets */
  padding: 0 1rem;
  border-radius: 12px;
  font-size: 0.9375rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
}
```

#### Status-Specific Colors
```css
/* Use class names matching status values */
.status-button.checked-in {
  background: var(--status-checked-in) !important;
  color: white !important;
  border-color: var(--status-checked-in) !important;
}

.status-button.at-gate {
  background: var(--status-at-gate) !important;
  color: white !important;
  border-color: var(--status-at-gate) !important;
}
```

### Accent Border Pattern

**Use `border-left` with status colors** - NOT pseudo-elements:

```css
/* ✅ CORRECT - Uses border property */
.class-card {
  border-left: 4px solid var(--status-not-checked-in);
}

.class-card.checked-in {
  border-left-color: var(--status-checked-in);
}

/* ❌ WRONG - Uses pseudo-element (harder to maintain) */
.class-card::before {
  content: '';
  position: absolute;
  left: 0;
  width: 4px;
  background: var(--status-checked-in);
}
```

**Why?** The `border-left` approach:
- Respects `border-radius` automatically
- No `overflow` issues
- Simpler and more maintainable
- Always visible (no specificity battles)

---

## Common Pitfalls & Solutions

### 1. Inline Styles vs CSS Classes

**Problem:** Mixing inline styles and CSS classes causes maintainability issues.

**Solution:** Use inline styles ONLY for:
- Dynamic values (calculated widths, positions)
- One-off adjustments during rapid prototyping

```tsx
// ✅ GOOD - Dynamic value
<div style={{ width: `${percentage}%` }}>

// ✅ GOOD - Temporary override during development
<div style={{ paddingRight: '120px' }}>

// ❌ BAD - Should be in CSS
<div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
```

**Refactor inline styles to CSS classes before committing:**
```tsx
// Before
<div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>

// After
<div className="card-row">

// In CSS
.card-row {
  display: flex;
  gap: 1rem;
  align-items: center;
}
```

### 2. Overflow Hidden Issues

**Problem:** `overflow: hidden` clips content that extends beyond boundaries.

**Watch out for:**
- Accent borders using pseudo-elements
- Tooltips or popovers
- Absolutely positioned children
- Box shadows on hover

**Solutions:**
```css
/* If you need overflow hidden for rounded corners */
.card {
  overflow: hidden;
  /* Use border properties for accents, NOT ::before */
  border-left: 4px solid var(--accent-color);
}

/* If you need overflow visible for shadows/tooltips */
.card {
  overflow: visible;
  /* Use clip-path for rounded corners instead */
  clip-path: inset(0 round 16px);
}
```

### 3. Z-Index Stacking Issues

**Problem:** Elements overlap incorrectly.

**Solution:** Use a consistent z-index scale:
```css
/* Z-Index Scale */
--z-base: 1;          /* Normal content */
--z-dropdown: 10;     /* Dropdowns, tooltips */
--z-sticky: 20;       /* Sticky headers */
--z-modal-backdrop: 30;  /* Modal backgrounds */
--z-modal: 40;        /* Modals */
--z-toast: 50;        /* Toast notifications */
```

### 4. Specificity Wars

**Problem:** CSS rules fighting each other with `!important`.

**Prevention:**
```css
/* ❌ BAD - Too specific */
.page .section .card .status-button.checked-in {
  background: green;
}

/* ✅ GOOD - Just enough specificity */
.status-button.checked-in {
  background: var(--status-checked-in);
}

/* Use !important ONLY for utility classes */
.always-visible {
  display: block !important;
}
```

### 5. Missing `min-width: 0` on Flex Items

**Problem:** Text doesn't truncate in flex containers.

**Solution:**
```css
.flex-container {
  display: flex;
  gap: 1rem;
}

.flex-grow {
  flex: 1;
  min-width: 0;  /* CRITICAL: Allows text truncation */
}

.long-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### 6. HMR Not Detecting Changes

**Problem:** Vite HMR doesn't reload CSS/component changes.

**Solutions:**
1. **Hard refresh:** Ctrl+Shift+R (Chrome/Edge) or Cmd+Shift+R (Mac)
2. **Restart dev server:** Kill and restart `npm run dev`
3. **Clear browser cache:** Developer tools → Network → "Disable cache"
4. **Check file is being watched:** Look for HMR update messages in console

---

## Testing Guidelines

### Visual Regression Testing

**Before making CSS changes:**
1. Take screenshots of affected components
2. Make your changes
3. Compare new screenshots with originals
4. Document any intentional changes

### Manual Testing Checklist

When updating card layouts or status displays:

- [ ] Test all status states (none, checked-in, at-gate, in-ring, conflict, pulled, completed)
- [ ] Test hover states
- [ ] Test on mobile viewport (375px width)
- [ ] Test on tablet viewport (768px width)
- [ ] Test on desktop viewport (1920px width)
- [ ] Test dark mode
- [ ] Test with long text (dog names, handler names)
- [ ] Test with empty/missing data
- [ ] Verify touch targets are 44px+ for mobile

### CSS-Specific Tests

```bash
# Run TypeScript type checking (catches CSS-in-JS issues)
npm run typecheck

# Run linter (catches some CSS issues)
npm run lint

# Build for production (catches missing imports, etc.)
npm run build
```

---

## Component Design Patterns

### DogDetails Card Pattern

```tsx
// Component structure
<div className={`class-card ${statusColor}`}>
  <button className={`status-button ${statusColor}`} style={{ position: 'absolute', top: '0.875rem', right: '1rem' }}>
    {/* Status button in top-right */}
  </button>

  <div className="class-content">
    <div className="class-position">
      {/* Position badge - 48x48px */}
    </div>

    <div className="class-info">
      <h4 className="class-name">
        {/* Element • Level • Section */}
      </h4>
      <div className="class-meta-details">
        {/* Date, Trial, Judge - single line */}
      </div>
      <div className="class-stats">
        {/* Time, Faults - if scored */}
      </div>
    </div>
  </div>
</div>
```

```css
/* Corresponding CSS */
.class-card {
  position: relative;
  border-left: 4px solid var(--status-color);
  padding: 0.875rem 1rem;
  border-radius: 16px;
}

.class-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.class-info {
  flex: 1;
  padding-right: 120px; /* Space for status button */
}
```

### Home Page Card Pattern

```tsx
// Simpler card for list view
<div className={`dog-card ${statusBorder}`}>
  <div className="dog-card-header">
    <span className="armband-badge">{armband}</span>
    <div className="dog-info">
      <h3>{callName}</h3>
      <p>{breed}</p>
    </div>
    <StatusBadge status={status} />
  </div>
</div>
```

---

## Migration & Refactoring Guidelines

### When Changing Database Schema

1. **Update TypeScript interfaces FIRST**
   ```typescript
   // src/stores/entryStore.ts
   export interface Entry {
     status: EntryStatus;  // New field
     // @deprecated - Use status instead
     checkinStatus?: EntryStatus;
   }
   ```

2. **Update service layer to map old → new**
   ```typescript
   // src/services/entryService.ts
   const status = row.entry_status ||
                  (row.check_in_status_text as EntryStatus) ||
                  'none';
   ```

3. **Update UI components incrementally**
   - Start with least-visible components
   - Update one page at a time
   - Test thoroughly before moving to next

4. **Keep backward compatibility temporarily**
   ```typescript
   // Support both old and new field names during transition
   const status = entry.status || entry.checkinStatus || 'none';
   ```

### CSS Refactoring Process

1. **Document current behavior** (screenshots, notes)
2. **Create new CSS classes** alongside old ones
3. **Migrate components one at a time**
4. **Remove old CSS** only after all components migrated
5. **Test across all breakpoints**

---

## Quick Reference

### Common CSS Values

```css
/* Spacing Scale */
--space-xs: 0.25rem;   /* 4px */
--space-sm: 0.5rem;    /* 8px */
--space-md: 0.75rem;   /* 12px */
--space-lg: 1rem;      /* 16px */
--space-xl: 1.5rem;    /* 24px */

/* Border Radius */
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 20px;

/* Touch Targets */
--touch-min: 44px;     /* Minimum touch target size */

/* Typography Scale */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
```

### Breakpoints

```css
/* Mobile First Approach */
@media (max-width: 640px) { /* Mobile */ }
@media (max-width: 1024px) { /* Tablet */ }
@media (min-width: 1025px) { /* Desktop */ }
```

---

## Resources

- [CSS Tricks - A Complete Guide to Flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)
- [MDN - CSS Layout](https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)

---

## Change Log

### 2025-10-24
- ✅ Migrated from `check_in_status_text` + `is_in_ring` to unified `entry_status` field
- ✅ Fixed DogDetails page layout (status button top-right, compact cards)
- ✅ Implemented colored left accent borders using `border-left` (not pseudo-elements)
- ✅ Aligned status button horizontally with position badge
- ✅ Changed accent border from pseudo-element to native border property

### Future Improvements
- [ ] Extract inline styles to CSS classes
- [ ] Add visual regression testing with Playwright
- [ ] Create Storybook for component library
- [ ] Document all component variants
