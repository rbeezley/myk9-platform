# myK9Q Tailwind CSS Migration Plan

**Status:** Phase 5 In Progress - Page CSS Migration
**Created:** 2026-01-21
**Updated:** 2026-01-21
**Goal:** Unify design system with myK9Show using Tailwind CSS

---

## Scope

| Metric | Count |
|--------|-------|
| CSS Files | 112 |
| Total Lines | ~58,000 |
| Components | ~90+ |
| Pages | ~15 |

---

## Migration Strategy

### Phase 1: Foundation (Day 1)
**Goal:** Set up Tailwind without breaking existing CSS

1. **Install Tailwind CSS v4** and dependencies
2. **Configure `tailwind.config.ts`** with myK9Q design tokens
3. **Add Tailwind directives** to entry CSS
4. **Ensure both systems coexist** - no visual changes yet

### Phase 2: Design Token Mapping (Day 1-2)
**Goal:** Map existing CSS variables to Tailwind

| CSS Variable | Tailwind Mapping |
|--------------|------------------|
| `--primary` | `primary` (accent color) |
| `--background` | `background` |
| `--foreground` | `foreground` |
| `--card` | `card` |
| `--border` | `border` |
| `--muted` | `muted` |
| `--success-green` | `success` |
| `--error-red` | `destructive` |
| `--warning-amber` | `warning` |
| `--token-space-*` | Tailwind spacing scale |
| `--token-radius-*` | Tailwind radius scale |

### Phase 3: Shared Components (Day 2-3)
**Priority:** Convert foundational UI components first

1. `src/styles/design-tokens.css` → `tailwind.config.ts`
2. `src/styles/apple-design-system.css` → Tailwind base layer
3. `src/components/ui/shared-ui.css` → Component classes
4. `src/styles/page-container.css` → Layout utilities

### Phase 4: Component-by-Component Migration (Day 3-10)
**Strategy:** Convert one component at a time, test, commit

#### Conversion Order (by dependency):
1. **Layout Components**
   - [ ] `page-container.css`
   - [ ] `containers.css`
   - [ ] `viewport.css`

2. **UI Primitives**
   - [ ] `shared-ui.css` (buttons, badges, cards)
   - [ ] `touch-targets.css`
   - [ ] `touch-feedback.css`

3. **Dialog Components**
   - [ ] `shared-dialog.css`
   - [ ] Individual dialog CSS files

4. **Page Styles** (largest effort)
   - [ ] `Home.css`
   - [ ] `EntryList.css`
   - [ ] `Settings.css`
   - [ ] `Results.css`
   - [ ] `DogDetails.css`
   - [ ] Scoresheet CSS files

5. **Theme Files**
   - [ ] `green-theme.css` → Tailwind theme
   - [ ] `orange-theme.css` → Tailwind theme
   - [ ] `purple-theme.css` → Tailwind theme
   - [ ] `high-contrast.css` → Tailwind variant

6. **Accessibility**
   - [ ] `reduce-motion.css` → `motion-reduce:` variant
   - [ ] `one-handed-mode.css`

### Phase 5: Cleanup (Day 10-11)
1. Remove converted CSS files
2. Remove unused CSS imports
3. Run CSS purge analysis
4. Final visual regression testing

---

## Technical Approach

### Coexistence Strategy
During migration, both systems will coexist:

```css
/* src/index.css */
@import "tailwindcss";

/* Existing CSS imports (gradually removed) */
@import './styles/design-tokens.css';
@import './styles/apple-design-system.css';
/* ... */
```

### Component Conversion Pattern

**Before (Semantic CSS):**
```tsx
// Component.tsx
import './Component.css';

<div className="card card--clickable">
  <h2 className="card-title">Title</h2>
</div>
```

**After (Tailwind):**
```tsx
// Component.tsx
import { cn } from '@/lib/utils';

<div className={cn(
  "rounded-xl border bg-card p-4 shadow-sm",
  "hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
)}>
  <h2 className="text-lg font-semibold">Title</h2>
</div>
```

### Preserving Design Tokens

The `tailwind.config.ts` will extend Tailwind with myK9Q tokens:

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        // Map to CSS variables for theme support
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // ... shadcn/ui compatible
      },
      spacing: {
        // Keep myK9Q spacing scale
        'xs': '0.125rem',  // 2px
        'sm': '0.25rem',   // 4px
        'md': '0.5rem',    // 8px
        'lg': '0.75rem',   // 12px
        'xl': '1rem',      // 16px
        '2xl': '1.25rem',  // 20px
        '3xl': '1.5rem',   // 24px
        '4xl': '2rem',     // 32px
      },
      borderRadius: {
        'sm': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      fontFamily: {
        sans: ['Montserrat', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
    },
  },
};
```

---

## Testing Strategy

### Visual Regression
- Screenshot comparison before/after each component
- Test at breakpoints: 375px, 768px, 1024px, 1440px
- Test light/dark mode
- Test all accent colors (green, blue, orange, purple)

### Functional Testing
- Touch targets remain 44px minimum
- Animations work correctly
- Theme switching works
- High contrast mode works

### Automated Tests
```bash
# Run existing test suite after each phase
pnpm test
pnpm test:e2e
```

---

## Rollback Plan

Each phase is committed separately. If issues arise:
1. `git revert` the problematic commit
2. CSS coexistence means old styles still work
3. No changes to myK9Qv3 production repo

---

## Files to Create

| File | Purpose |
|------|---------|
| `tailwind.config.ts` | Tailwind configuration with myK9Q tokens |
| `postcss.config.js` | PostCSS configuration |
| `src/lib/utils.ts` | `cn()` utility for class merging |
| `src/styles/tailwind.css` | Tailwind entry point |

---

## Success Criteria

1. All 112 CSS files converted or removed
2. Visual parity with current design
3. All tests passing
4. Build size reduced (Tailwind purging)
5. Same design tokens as myK9Show
6. Documentation updated

---

## Progress

### Completed
- [x] **Phase 1:** Install Tailwind CSS v4 with `@tailwindcss/postcss`
- [x] **Phase 2:** Create `tailwind.config.js` with all design tokens mapped
- [x] **Phase 3:** Create `tailwind-utilities.css` with reusable component classes
- [x] Add `cn()` utility in `src/lib/utils.ts`
- [x] Verify build with both CSS systems coexisting
- [x] **Phase 4:** Convert UI components to Tailwind

### Phase 4: UI Components Converted to Tailwind

The following components now use inline Tailwind utilities via `cn()`:

**Fully Converted (inline Tailwind):**
- Badge, Button, Card, EmptyState, ErrorState
- FilterTabs, StickyHeader, RefreshIndicator
- StatusBadge, LoadingSpinner, FAB
- SearchSortControls, CollapsibleSection
- OfflineIndicator, BottomSheet
- TabBar, Popover
- FilterPanel, FilterTriggerButton, ActiveFilterChip
- PullToRefresh, ClassStatusBadge, CheckInStatusBadge
- TrialDateBadge, CompactOfflineIndicator
- SyncIndicator, AutoLogoutWarning, DeviceTierToast
- HamburgerMenu (converted with menuItemStyles object)
- VirtualList, VirtualGrid
- SyncProgress
- OfflineFallback
- SyncStatusBanner, CompactSyncStatus
- ConflictResolver
- SyncStatusPopover (converted with indicatorStyles + popoverStyles objects)
- StorageManager (converted with styles object)
- InstallPrompt (converted with cardStyles + bannerStyles + iosStyles objects)
- DeviceDebugPanel (converted with styles object)

All UI components in `src/components/ui/` are now using inline Tailwind utilities.
The remaining CSS files are page-level styles and specialized features (scoresheets, dialogs).

### Phase 5: Page CSS Migration (In Progress)

**Converted Page CSS Files:**
- `ClassCardSkeleton.css` (111 lines) - converted to inline Tailwind in ClassCardSkeleton.tsx
- `ConfirmationDialog.css` (302 lines) - converted to inline Tailwind in ConfirmationDialog.tsx
- `TVRunOrder.css` (325 lines) - converted to inline Tailwind in TVRunOrder.tsx
- `Announcements.css` (390 lines) - converted to inline Tailwind in Announcements.tsx (removed from index.css)
- `MigrationTest.css` (400 lines) - converted to inline Tailwind in MigrationTest.tsx

**Converted Component CSS Files:**
- `ToastContainer.css` (25 lines) - converted to inline Tailwind
- `SettingsToggle.css` (52 lines) - converted with `peer-checked:` utilities for iOS-style toggle
- `ShowProgressStats.css` (53 lines) - converted grid layout and icon gradients
- `NotificationBell.css` (58 lines) - converted button and badge styles
- `DogCardSkeleton.css` (93 lines) - converted shimmer animation with `animate-pulse`

**Total CSS Lines Converted:** ~1,809 lines

### CSS Files Cleaned Up
The following CSS files were removed after component conversion:
- `TabBar.css`
- `FilterPanel.css`
- `Popover.css`
- `ActiveFilterChip.css`
- `FilterTriggerButton.css`
- `ClassCardSkeleton.css`
- `ConfirmationDialog.css`
- `TVRunOrder.css`
- `Announcements.css`
- `MigrationTest.css`
- `ToastContainer.css`
- `SettingsToggle.css`
- `ShowProgressStats.css`
- `NotificationBell.css`
- `DogCardSkeleton.css`

### Files Created
| File | Purpose |
|------|---------|
| `tailwind.config.js` | Design tokens mapped to Tailwind theme |
| `postcss.config.js` | PostCSS with @tailwindcss/postcss plugin |
| `src/styles/tailwind-utilities.css` | Component layer with `tw-*` class prefixes |
| `src/lib/utils.ts` | `cn()` utility (already existed) |

### Component Classes Available
The following `tw-*` prefixed classes are now available:
- **Layout:** `tw-page-container`, `tw-page-header`
- **Cards:** `tw-card`, `tw-card-interactive`, `tw-card-glass`, `tw-card-pending`
- **Buttons:** `tw-btn-primary`, `tw-btn-secondary`, `tw-btn-ghost`, `tw-btn-icon`
- **Badges:** `tw-badge`, `tw-badge-sm/md/lg`, `tw-badge-success/warning/error/info`
- **Typography:** `tw-text-title`, `tw-text-heading`, `tw-text-body`, `tw-text-caption`
- **Forms:** `tw-input`
- **Status:** `tw-status-checked-in`, `tw-status-in-ring`, etc.
- **Tabs:** `tw-tabs-container`, `tw-tab-trigger`

## Remaining Work

### CSS Files by Category (Line Counts)

| Category | Files | Lines | Priority |
|----------|-------|-------|----------|
| Page CSS (globally imported) | 7 | ~10,000 | High |
| shared-ui.css | 1 | 6,502 | Medium |
| Dialog CSS | 12 | ~1,500 | Medium |
| Scoresheet CSS | 8 | ~2,000 | Medium |
| Theme CSS | 3 | ~500 | Low |
| Utility CSS | 6 | ~1,000 | Low |
| Other component CSS | ~60 | ~5,000 | Low |

### Migration Strategy Going Forward

The coexistence strategy is working well. Options for completion:

1. **Gradual Migration (Recommended)**
   - New components use Tailwind inline styles
   - Convert existing components opportunistically when modifying them
   - Keep global CSS imports for unchanged components

2. **Full Migration**
   - Convert all remaining ~100 CSS files to inline Tailwind
   - Estimated effort: 20-40 hours manual work
   - Remove global CSS imports after conversion

3. **Hybrid Approach**
   - Convert high-use page CSS (Home, EntryList, ClassList)
   - Keep specialized CSS (scoresheets, dialogs) as-is
   - Focus on design consistency

## Next Steps

1. [x] Install Tailwind CSS dependencies
2. [x] Create `tailwind.config.js` with design tokens
3. [x] Add `cn()` utility
4. [x] Test coexistence without visual changes
5. [x] Create foundational component classes
6. [x] Phase 4: Component-by-component migration (30+ UI components done)
7. [ ] Continue Phase 4: Migrate page-level CSS files (optional)
8. [ ] Phase 5: Cleanup remaining unused CSS (optional)
