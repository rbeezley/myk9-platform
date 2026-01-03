# MyK9Show Design System Components

## Overview
Reusable UI components that implement the Apple-inspired design language consistent with myK9Show's sophisticated aesthetic.

## Core Principles
- **Apple-inspired Design**: Clean, modern, sophisticated
- **Mobile-first**: 44px minimum touch targets for outdoor usage
- **Light/Dark Mode**: Seamless theme switching
- **Typography**: SF Pro Display/Text font stack with Apple font weights (590, 650, 700)
- **Animation**: Apple easing curves `cubic-bezier(0.25, 0.46, 0.45, 0.94)`

## Components

### Card
Sophisticated card component with hover effects and status variants.

```tsx
import { Card, CardHeader, CardContent, CardActions } from '../components/ui';

<Card variant="clickable" onClick={() => handleClick()}>
  <CardHeader>Header content</CardHeader>
  <CardContent>Main content</CardContent>
  <CardActions>Action buttons</CardActions>
</Card>
```

**Variants:**
- `default` - Basic card
- `clickable` - Interactive card with hover effects
- `scored` - Green left border for completed items
- `unscored` - Orange left border for pending items

### Button
Apple-style buttons with multiple variants and sizes.

```tsx
import { Button } from '../components/ui';

<Button variant="gradient" size="md" fullWidth>
  Continue Scoring
</Button>
```

**Variants:**
- `primary` - Standard blue button
- `secondary` - Muted background button
- `outline` - Transparent with border
- `gradient` - Blue to purple gradient (brand style)

**Sizes:**
- `sm` - 36px min-height
- `md` - 44px min-height (recommended for mobile)
- `lg` - 52px min-height

### Badge
Status indicators and armband numbers.

```tsx
import { Badge, ArmbandBadge, StatusIndicator } from '../components/ui';

<ArmbandBadge number={15} />
<StatusIndicator status="scored" text="COMPLETED" />
<Badge variant="success">Qualified</Badge>
```

**Badge Variants:**
- `default`, `success`, `warning`, `error`, `info`, `gradient`

**Status Types:**
- `scored` - Green with checkmark
- `pending` - Orange warning style

## Design Tokens

### Colors
```css
--brand-blue: #007AFF;      /* Primary brand color */
--brand-purple: #5856D6;    /* Secondary brand color */
--success: #34C759;         /* Green for success states */
--warning: #FF9500;         /* Orange for pending states */
--error: #FF3B30;           /* Red for error states */
```

### Typography
```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
font-weight: 590;  /* Medium */
font-weight: 650;  /* Semibold */
font-weight: 700;  /* Bold */
```

### Spacing & Layout
- Border radius: `0.75rem` (12px) for buttons, `1rem` (16px) for cards
- Padding: `1.5rem` (24px) for cards, `0.75rem 1rem` for buttons
- Touch targets: Minimum 44px for outdoor usage

## Usage Guidelines

1. **Always use the reusable components** instead of custom styling
2. **Test on mobile devices** to ensure touch targets work outdoors
3. **Verify contrast** in both light and dark modes
4. **Follow the component APIs** for consistent behavior
5. **Use proper semantic HTML** within components

## Mobile Optimization

All components are optimized for outdoor trial usage:
- Large touch targets (44px minimum)
- High contrast ratios for readability in sunlight
- Smooth animations that don't drain battery
- Responsive design that works on all screen sizes

## Implementation

Import components from the UI package:
```tsx
import { Card, Button, Badge, ArmbandBadge, StatusIndicator } from '../components/ui';
```

Components automatically inherit theme variables and work with the light/dark mode system.