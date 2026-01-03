# Outdoor Visibility Patterns - Dog Show Trial Optimizations

## Overview

This document outlines critical design patterns optimized for outdoor dog show trial environments where judges need reliable, high-contrast interfaces under challenging lighting conditions.

## Enhanced Dark Mode Colors

### Background & Surfaces
```css
/* Enhanced for outdoor sunlight visibility */
--background: #1a1d23;      /* Not pure black - better sunlight readability */
--card: #1a1d23;           /* Consistent with background */
--border: #4a5568;         /* Higher contrast borders */
```

### Text Colors
```css
/* Pure white for maximum contrast */
--foreground: #ffffff;
--muted-foreground: #ffffff;
--text-primary: #ffffff;
--text-secondary: #ffffff;
--text-tertiary: #ffffff;
```

## Orange Glow Implementation

### Pending Entry States
Apply prominent orange glow to entries that need attention:

```css
.entry-card.checkin-none,
.entry-card.pending-entry {
  box-shadow: 0 0 0 2px #FF9500, 0 4px 12px rgba(255, 149, 0, 0.3);
  border-color: #FF9500;
}
```

### Usage Pattern
```tsx
<Card 
  className={`entry-card ${
    !entry.isScored && !entry.checkinStatus ? 'checkin-none' : ''
  }`}
>
  {/* Entry content */}
</Card>
```

## Enhanced Touch Targets

### Stress-Ready Sizing
```css
/* Minimum 52px for stress conditions */
.stress-touch-target {
  min-height: 52px;
  min-width: 52px;
  padding: 0.75rem 1rem;
}

/* Status buttons - enhanced for thumb access */
.checkin-status {
  min-height: 32px;
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
}
```

## Haptic Feedback Simulation

### Press Response
```css
.interactive-element:active {
  transform: scale(0.98);
  transition: transform 0.1s ease-out;
}
```

### Implementation Example
```tsx
const handlePress = (e) => {
  // Visual feedback
  e.currentTarget.style.transform = 'scale(0.98)';
  setTimeout(() => {
    e.currentTarget.style.transform = '';
  }, 100);
  
  // Your action here
  handleAction();
};
```

## Performance Optimizations

### Reduced Motion Support
```css
@media (prefers-reduced-motion: reduce) {
  .entry-card.checkin-none {
    box-shadow: 0 0 0 2px #FF9500 !important;
  }
  
  .interactive-element:active {
    transform: none !important;
  }
}
```

### Low-End Device Fallbacks
```css
@media (max-width: 480px) and (max-resolution: 150dpi) {
  .entry-card {
    backdrop-filter: none;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .entry-card.checkin-none {
    border: 2px solid #FF9500 !important;
    box-shadow: none !important;
  }
}
```

## Text Readability Enhancements

### Text Shadows for Contrast
```css
.dog-name,
.breed,
.handler {
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.1);
}
```

### Dark Mode Text Hierarchy
```css
[data-theme="dark"] .dog-name {
  color: #ffffff;  /* Pure white for maximum contrast */
}

[data-theme="dark"] .breed,
[data-theme="dark"] .handler {
  color: #ffffff;  /* Pure white for outdoor visibility */
}
```

## Component Integration Examples

### EntryList Cards
```tsx
<Card 
  className={`entry-card ${
    !entry.isScored ? 'unscored' : 'scored'
  } ${
    !entry.isScored && !entry.checkinStatus ? 'checkin-none' : ''
  }`}
  onClick={handleEntryClick}
>
  <ArmbandBadge number={entry.armband} />
  
  <div 
    className={`checkin-status ${entry.checkinStatus || 'none'}`}
    onClick={handleStatusClick}
  >
    {getStatusDisplay(entry.checkinStatus)}
  </div>
  
  {/* Entry content */}
</Card>
```

### Status Buttons
```tsx
<button 
  className="status-option"
  onClick={handleStatusChange}
  style={{ minHeight: '52px' }}
>
  <span className="popup-icon">✓</span>
  Checked-in
</button>
```

### Tab Navigation
```tsx
<button 
  className={`status-tab ${activeTab === 'pending' ? 'active' : ''}`}
  onClick={() => setActiveTab('pending')}
  style={{ minHeight: '52px' }}
>
  <span className="status-icon">⏳</span>
  Pending ({pendingCount})
</button>
```

## Testing Guidelines

### Light Conditions
- Test in direct sunlight
- Test with device brightness at 50%
- Verify text remains readable
- Confirm orange glow is visible

### Touch Interaction
- Test with gloves
- Test one-handed operation
- Verify thumb reach on large phones
- Confirm haptic feedback is noticeable

### Performance
- Test on older devices (iPhone 8, Android equivalent)
- Verify smooth animations
- Check battery impact
- Test with reduced motion enabled

## Implementation Checklist

- [ ] Enhanced dark mode colors applied
- [ ] Orange glow implemented for pending states
- [ ] Touch targets increased to 52px minimum
- [ ] Haptic feedback simulation added
- [ ] Performance optimizations in place
- [ ] Reduced motion support added
- [ ] Text shadows for outdoor readability
- [ ] Device fallbacks implemented

## Cross-Component Usage

These patterns should be applied consistently across:
- EntryList components
- Scoresheet interfaces
- Navigation elements
- Modal dialogs
- Form controls
- Status indicators

## Maintenance Notes

- Test outdoor visibility quarterly
- Update touch targets based on user feedback
- Monitor performance on new devices
- Validate accessibility compliance
- Review with judges after trial events