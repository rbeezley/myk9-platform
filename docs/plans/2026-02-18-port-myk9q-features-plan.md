# Port myK9Q-React Features — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port 3 features from standalone myK9Q-React into the monorepo's `apps/myk9q`: Show Flyer, Print Enhancements (sort order + A/B sections), and PWA Update UX improvements.

**Architecture:** Semantic port — read standalone code, adapt to the monorepo's refactored file structure. New files are copied with import adjustments. Modified files are surgically updated to preserve the monorepo's decomposed architecture.

**Tech Stack:** React, TypeScript, Vite PWA, qrcode.react (new dep), Zustand, Supabase

---

## Task 1: Add `qrcode.react` dependency

**Files:**

- Modify: `apps/myk9q/package.json`

**Step 1: Install the dependency**

Run: `cd apps/myk9q && pnpm add qrcode.react`

**Step 2: Verify installation**

Run: `pnpm typecheck`
Expected: No new errors

**Step 3: Commit**

```bash
git add apps/myk9q/package.json pnpm-lock.yaml
git commit -m "chore(myk9q): add qrcode.react for ShowFlyer QR codes"
```

---

## Task 2: Create ShowFlyer component

**Files:**

- Create: `apps/myk9q/src/components/reports/ShowFlyer.tsx`

**Step 1: Create the ShowFlyer component**

Copy from standalone with correct imports. The file is self-contained (only depends on `qrcode.react` and React):

```tsx
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

export interface ShowFlyerProps {
  showName: string;
  exhibitorPasscode: string;
  loginUrl: string;
  clubName?: string;
  showDates?: string;
  secretaryName?: string;
  chairmanName?: string;
}

export const ShowFlyer: React.FC<ShowFlyerProps> = ({
  showName,
  exhibitorPasscode,
  loginUrl,
  clubName,
  showDates,
  secretaryName,
  chairmanName,
}) => {
  return (
    <div className="print-report show-flyer">
      {/* Page 1 — Show entry point */}
      <div className="flyer-page flyer-page-1">
        <div className="flyer-branding">
          <img src="/myK9Q-teal-192.png" alt="myK9Q Logo" className="flyer-logo" />
          <h1 className="flyer-brand-name">myK9Q</h1>
          <div className="flyer-tagline">
            <span className="flyer-tagline-word">Queue</span>
            <span className="flyer-arrow">&rarr;</span>
            <span className="flyer-tagline-word">Qualify</span>
          </div>
        </div>

        <h2 className="flyer-show-name">{showName}</h2>
        {(clubName || showDates) && (
          <div className="flyer-show-details">
            {clubName && <p className="flyer-club-name">{clubName}</p>}
            {showDates && <p className="flyer-show-dates">{showDates}</p>}
          </div>
        )}

        <div className="flyer-qr-section">
          <p className="flyer-qr-instruction">Scan to access your show</p>
          <QRCodeSVG value={loginUrl} size={280} level="M" marginSize={4} />
        </div>

        <div className="flyer-passcode-section">
          <p className="flyer-passcode-label">Exhibitor Pass Code</p>
          <div className="flyer-passcode-value">{exhibitorPasscode}</div>
          <p className="flyer-passcode-hint">
            Or visit <strong>myk9q.com</strong> and enter this code
          </p>
        </div>
      </div>

      {/* Page 2 — Getting Started Guide */}
      <div className="flyer-page flyer-page-2">
        <div className="flyer-branding-small">
          <img src="/myK9Q-teal-192.png" alt="myK9Q Logo" className="flyer-logo-sm" />
          <span className="flyer-brand-name-sm">myK9Q</span>
          <span className="flyer-tagline-sm">Getting Started Guide</span>
          <span className="flyer-header-show">{showName}</span>
        </div>

        <div className="guide-features">
          <h3>What You Can Do</h3>
          <div className="guide-feature-grid">
            <div className="guide-feature-item">
              <span className="guide-feature-icon">&#x2705;</span>
              <div>
                <strong>Self Check-in</strong>
                <p>Check in from your phone</p>
              </div>
            </div>
            <div className="guide-feature-item">
              <span className="guide-feature-icon">&#x1F514;</span>
              <div>
                <strong>Push Notifications</strong>
                <p>Get notified when your class is ready</p>
              </div>
            </div>
            <div className="guide-feature-item">
              <span className="guide-feature-icon">&#x2764;&#xFE0F;</span>
              <div>
                <strong>Favorite Dogs</strong>
                <p>Follow your dogs across all classes</p>
              </div>
            </div>
            <div className="guide-feature-item">
              <span className="guide-feature-icon">&#x2764;&#xFE0F;</span>
              <div>
                <strong>Favorite Classes</strong>
                <p>Track the classes you care about</p>
              </div>
            </div>
            <div className="guide-feature-item">
              <span className="guide-feature-icon">&#x1F4CA;</span>
              <div>
                <strong>Results &amp; Placements</strong>
                <p>View scores and placements when available</p>
              </div>
            </div>
            <div className="guide-feature-item">
              <span className="guide-feature-icon">&#x1F4F1;</span>
              <div>
                <strong>Offline Access</strong>
                <p>Works without WiFi once loaded</p>
              </div>
            </div>
          </div>
        </div>

        <div className="guide-section">
          <h3>For Exhibitors</h3>
          <ol className="guide-steps">
            <li>
              Scan the QR code or visit <strong>myk9q.com</strong>
            </li>
            <li>
              Enter the exhibitor pass code: <strong>{exhibitorPasscode}</strong>
            </li>
            <li>Enable push notifications when prompted</li>
            <li>Tap the heart on your dogs to add them to Favorites</li>
          </ol>
        </div>

        <div className="guide-section">
          <h3>For Judges &amp; Timers</h3>
          <ol className="guide-steps">
            <li>Get your personal pass code from the Trial Secretary</li>
            <li>
              Visit <strong>myk9q.com</strong> and enter your code
            </li>
            <li>Tap the heart on your assigned classes to add to Favorites</li>
            <li>Enable or disable audible time warnings in Settings</li>
          </ol>
        </div>

        <div className="guide-footer">
          <QRCodeSVG value={loginUrl} size={240} level="M" marginSize={3} />
          <p className="guide-footer-url">www.myk9q.com</p>
          {secretaryName || chairmanName ? (
            <div className="guide-contact">
              <p className="guide-contact-heading">Questions? Contact:</p>
              {secretaryName && (
                <p className="guide-contact-line">
                  <span className="guide-contact-role">Trial Secretary:</span> {secretaryName}
                </p>
              )}
              {chairmanName && (
                <p className="guide-contact-line">
                  <span className="guide-contact-role">Trial Chairman:</span> {chairmanName}
                </p>
              )}
            </div>
          ) : (
            <p className="guide-contact-heading">Questions? Ask the Trial Secretary for help.</p>
          )}
        </div>
      </div>
    </div>
  );
};
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

---

## Task 3: Add ShowFlyer to reportService

**Files:**

- Modify: `apps/myk9q/src/services/reportService.ts`

**Step 1: Add ShowFlyer import**

At top of file (after line 7 `ScoresheetReport` import), add:

```typescript
import { ShowFlyer, ShowFlyerProps } from '../components/reports/ShowFlyer';
```

**Step 2: Add ShowFlyer CSS to PRINT_STYLES**

After the existing `@media print { .scoresheet-entry-row ... }` block (before the closing backtick of PRINT_STYLES), add the ShowFlyer CSS styles:

```css
/* Show Flyer Styles */
.show-flyer {
  padding: 0;
}
.flyer-page {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5in 1in;
  box-sizing: border-box;
}
.flyer-page-1 {
  justify-content: center;
  min-height: 9in;
  page-break-after: always;
}
.flyer-page-2 {
  justify-content: flex-start;
  align-items: flex-start;
  min-height: 9in;
}
.flyer-branding {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 1.5rem;
}
.flyer-logo {
  width: 140px;
  height: 140px;
}
.flyer-brand-name {
  font-size: 56px;
  font-weight: bold;
  color: #14b8a6;
  margin: 0.5rem 0 0 0;
  letter-spacing: -1px;
}
.flyer-tagline {
  font-size: 24px;
  color: #555;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
.flyer-tagline-word {
  font-weight: 500;
}
.flyer-arrow {
  color: #14b8a6;
  font-weight: bold;
  font-size: 28px;
}
.flyer-show-name {
  font-size: 28px;
  font-weight: 600;
  text-align: center;
  margin: 0.75rem 0 0.25rem 0;
  color: #333;
}
.flyer-show-details {
  text-align: center;
  margin-bottom: 1.25rem;
}
.flyer-club-name {
  font-size: 18px;
  color: #555;
  margin: 0.25rem 0 0 0;
  font-weight: 500;
}
.flyer-show-dates {
  font-size: 16px;
  color: #777;
  margin: 0.25rem 0 0 0;
}
.flyer-qr-section {
  text-align: center;
  margin: 1rem 0;
}
.flyer-qr-instruction {
  font-size: 18px;
  color: #555;
  margin-bottom: 1rem;
}
.flyer-passcode-section {
  text-align: center;
  margin-top: 1.5rem;
}
.flyer-passcode-label {
  font-size: 18px;
  color: #555;
  margin-bottom: 0.5rem;
}
.flyer-passcode-value {
  font-size: 48px;
  font-weight: 700;
  letter-spacing: 8px;
  color: #14b8a6;
  font-family: 'Courier New', monospace;
  background: #f0fdfa;
  padding: 0.5rem 1.5rem;
  border-radius: 12px;
  border: 2px solid #14b8a6;
  display: inline-block;
}
.flyer-passcode-hint {
  font-size: 14px;
  color: #888;
  margin-top: 0.75rem;
}
.flyer-passcode-hint strong {
  color: #14b8a6;
}
.flyer-branding-small {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  align-items: center;
  width: 100%;
}
.flyer-logo-sm {
  width: 32px;
  height: 32px;
}
.flyer-brand-name-sm {
  font-size: 24px;
  font-weight: bold;
  color: #14b8a6;
  margin: 0;
}
.flyer-tagline-sm {
  font-size: 18px;
  color: #333;
  font-weight: 600;
  margin-left: 0.5rem;
  padding-left: 0.5rem;
  border-left: 2px solid #ccc;
}
.flyer-header-show {
  margin-left: auto;
  font-size: 13px;
  color: #888;
  font-weight: 500;
}
.guide-features {
  margin-bottom: 1.25rem;
  width: 100%;
}
.guide-features h3 {
  font-size: 18px;
  margin: 0 0 0.75rem 0;
  color: #333;
  border-bottom: 2px solid #14b8a6;
  padding-bottom: 0.25rem;
}
.guide-feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.guide-feature-item {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  padding: 0.4rem 0.5rem;
  background: #f8f8f8;
  border-radius: 8px;
}
.guide-feature-icon {
  font-size: 22px;
  flex-shrink: 0;
}
.guide-feature-item strong {
  font-size: 13px;
  display: block;
}
.guide-feature-item p {
  font-size: 11px;
  color: #666;
  margin: 2px 0 0 0;
}
.guide-section {
  margin-bottom: 1.25rem;
  width: 100%;
}
.guide-section h3 {
  font-size: 16px;
  margin: 0 0 0.5rem 0;
  color: #333;
  border-bottom: 2px solid #14b8a6;
  padding-bottom: 0.25rem;
}
.guide-steps {
  margin: 0;
  padding-left: 1.5rem;
  font-size: 13px;
  line-height: 1.7;
}
.guide-steps strong {
  color: #14b8a6;
}
.guide-footer {
  margin-top: auto;
  width: 100%;
  padding-top: 1.5rem;
  border-top: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  font-size: 14px;
  color: #666;
}
.guide-footer-url {
  font-weight: 600;
  color: #14b8a6;
  font-size: 14px;
  margin: 0;
}
.guide-contact {
  text-align: center;
  margin-top: 0.5rem;
}
.guide-contact-heading {
  font-weight: 600;
  color: #333;
  margin: 0 0 0.25rem 0;
}
.guide-contact-line {
  margin: 0.15rem 0;
}
.guide-contact-role {
  font-weight: 600;
  color: #14b8a6;
}
@media print {
  .flyer-page {
    padding: 0.25in 0.5in;
  }
  .flyer-page-1 {
    min-height: auto;
    page-break-after: always;
  }
  .flyer-page-2 {
    min-height: 9in;
  }
  .flyer-passcode-value {
    background: #f0fdfa !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .flyer-brand-name,
  .flyer-brand-name-sm,
  .flyer-arrow,
  .flyer-passcode-value,
  .flyer-passcode-hint strong,
  .guide-steps strong,
  .guide-footer-url,
  .guide-contact-role {
    color: #14b8a6 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .guide-feature-item {
    background: #f8f8f8 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
```

**Step 3: Add generateShowFlyer function**

After the `generateScoresheetReport` function, add:

```typescript
/**
 * Generate and print show flyer (2-page handout with QR code)
 */
export const generateShowFlyer = (
  showName: string,
  exhibitorPasscode: string,
  loginUrl: string,
  options?: {
    clubName?: string;
    showDates?: string;
    secretaryName?: string;
    chairmanName?: string;
  }
): void => {
  try {
    const props: ShowFlyerProps = {
      showName,
      exhibitorPasscode,
      loginUrl,
      ...options,
    };

    const componentHTML = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ShowFlyer, props)
    );

    const htmlDoc = generatePrintHTML('Show Flyer - ' + showName, componentHTML);

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(htmlDoc);
      printWindow.document.close();
    } else {
      logger.error('Failed to open print window. Please check popup blocker settings.');
      alert("Unable to open print window. Please check your browser's popup blocker settings.");
    }
  } catch (error) {
    logger.error('Error generating show flyer:', error);
    alert('Error generating show flyer. Please try again.');
  }
};
```

**Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

---

## Task 4: Integrate ShowFlyer into TrialSecretary

**Files:**

- Modify: `apps/myk9q/src/pages/TrialSecretary/TrialSecretary.tsx`
- Modify: `apps/myk9q/src/pages/TrialSecretary/TrialSecretary.css`

**Step 1: Add imports to TrialSecretary.tsx**

Add `Printer` to the lucide-react import (line 17). Add new imports after line 22:

```typescript
import { generatePasscodesFromLicenseKey } from '../../utils/auth';
import { generateShowFlyer } from '../../services/reportService';
import { replicatedShowsTable } from '@/services/replication';
```

**Step 2: Add formatShowDates and handlePrintFlyer inside the component**

After the `clearAllFilters` callback (around line 51), add:

```typescript
// Format show date range for flyer
const formatShowDates = useCallback((startDate: string, endDate?: string): string => {
  const start = new Date(startDate + 'T00:00:00');
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  if (!endDate || startDate === endDate) {
    return `${monthNames[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()}`;
  }

  const end = new Date(endDate + 'T00:00:00');
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${monthNames[start.getMonth()]} ${start.getDate()}\u2013${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${monthNames[start.getMonth()]} ${start.getDate()} \u2013 ${monthNames[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}, []);

// Print show flyer handler
const handlePrintFlyer = useCallback(async () => {
  if (!showContext?.licenseKey || !showContext?.showName || !showContext?.showId) return;

  const passcodes = generatePasscodesFromLicenseKey(showContext.licenseKey);
  if (!passcodes) {
    alert('Unable to generate exhibitor passcode from license key.');
    return;
  }

  const exhibitorCode = passcodes.exhibitor;
  const loginUrl = `https://myk9q.com/login?code=${exhibitorCode}`;

  const showData = await replicatedShowsTable.getShowById(showContext.showId);

  generateShowFlyer(showContext.showName, exhibitorCode, loginUrl, {
    clubName: showData?.club_name || showContext.clubName || undefined,
    showDates: showData?.start_date
      ? formatShowDates(showData.start_date, showData.end_date)
      : undefined,
    secretaryName: showData?.secretary_name || showData?.show_secretary_name || undefined,
    chairmanName: showData?.chairman_name || undefined,
  });
}, [showContext, formatShowDates]);
```

**Step 3: Update the Reports tab JSX**

Replace the existing reports tab rendering (line 178-179):

```tsx
{
  activeTab === 'reports' && showContext?.licenseKey && (
    <CheckInStatusReport licenseKey={showContext.licenseKey} />
  );
}
```

With:

```tsx
{
  activeTab === 'reports' && showContext?.licenseKey && (
    <>
      {!isReadOnly && (
        <div className="reports-actions">
          <button className="btn btn-primary reports-flyer-btn" onClick={handlePrintFlyer}>
            <Printer size={18} />
            Print Show Flyer
          </button>
        </div>
      )}
      <CheckInStatusReport licenseKey={showContext.licenseKey} />
    </>
  );
}
```

**Step 4: Add CSS styles to TrialSecretary.css**

Append these styles:

```css
.reports-actions {
  margin-bottom: var(--token-space-xl);
}

.reports-flyer-btn {
  display: flex;
  align-items: center;
  gap: var(--token-space-sm);
  width: 100%;
  justify-content: center;
  padding: var(--token-space-md) var(--token-space-lg);
  font-size: 1rem;
  font-weight: 600;
}

.reports-flyer-btn:hover {
  background: #0d9488 !important;
  color: #fff !important;
}
```

**Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/myk9q/src/components/reports/ShowFlyer.tsx apps/myk9q/src/services/reportService.ts apps/myk9q/src/pages/TrialSecretary/TrialSecretary.tsx apps/myk9q/src/pages/TrialSecretary/TrialSecretary.css
git commit -m "feat(myk9q): add printable show flyer with QR deep-link

Port from standalone myK9Q-React. 2-page printable handout with QR code
and exhibitor passcode for distributing at shows."
```

---

## Task 5: Add sortByArmband to reportUtils

**Files:**

- Modify: `apps/myk9q/src/components/reports/reportUtils.ts`

**Step 1: Add the function**

After the `sortByRunOrder` function (after line 39), add:

```typescript
// Sort entries by armband number
export const sortByArmband = (entries: Entry[]): Entry[] => {
  return [...entries].sort((a, b) => a.armband - b.armband);
};
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

---

## Task 6: Add sortOrder prop to report components

**Files:**

- Modify: `apps/myk9q/src/components/reports/CheckInSheet.tsx`
- Modify: `apps/myk9q/src/components/reports/ScoresheetReport.tsx`
- Modify: `apps/myk9q/src/components/reports/ResultsSheet.tsx`

**Step 1: Update CheckInSheet**

Add `sortByArmband` to the import from `./reportUtils` (line 3). Add to CheckInSheetProps interface:

```typescript
sortOrder?: 'run-order' | 'armband';
```

Update the destructuring and sort (line 22):

```typescript
export const CheckInSheet: React.FC<CheckInSheetProps> = ({ classInfo, entries, sortOrder }) => {
  const sortedEntries = sortOrder === 'armband' ? sortByArmband(entries) : sortByRunOrder(entries);
```

**Step 2: Update ScoresheetReport**

Add `sortByArmband` to the import from `./reportUtils` (line 3). Add to ScoresheetReportProps interface:

```typescript
sortOrder?: 'run-order' | 'armband';
showSectionBadge?: boolean;
```

Update the destructuring and sort (line 49):

```typescript
export const ScoresheetReport: React.FC<ScoresheetReportProps> = ({ classInfo, entries, sortOrder, showSectionBadge }) => {
  const sortedEntries = sortOrder === 'armband' ? sortByArmband(entries) : sortByRunOrder(entries);
```

Add section badge rendering after the armband number in the entry row. After `<div className="entry-armband">{entry.armband}</div>` add:

```tsx
{
  showSectionBadge && entry.section && (
    <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{entry.section}</div>
  );
}
```

**Step 3: Update ResultsSheet**

Add `sortByArmband` to the import from `./reportUtils` (line 3, alongside `sortByPlacement`). Add to ResultsSheetProps interface:

```typescript
sortOrder?: 'placement' | 'armband';
```

Update the destructuring and sort (line 33):

```typescript
export const ResultsSheet: React.FC<ResultsSheetProps> = ({ classInfo, entries, sortOrder }) => {
  const sortedEntries = sortOrder === 'armband' ? sortByArmband(entries) : sortByPlacement(entries);
```

**Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

---

## Task 7: Add ReportSortOrder type and options to reportService generate functions

**Files:**

- Modify: `apps/myk9q/src/services/reportService.ts`

**Step 1: Add ReportSortOrder type**

After the imports (after line 9), add:

```typescript
/** Sort order for print reports */
export type ReportSortOrder = 'run-order' | 'armband' | 'placement';
```

**Step 2: Update generateCheckInSheet signature and body**

Change the function signature to accept options:

```typescript
export const generateCheckInSheet = (
  classInfo: ReportClassInfo,
  entries: Entry[],
  options?: { sortOrder?: ReportSortOrder }
): void => {
```

Update the props creation to pass sortOrder:

```typescript
const props: CheckInSheetProps = {
  classInfo,
  entries,
  sortOrder: (options?.sortOrder === 'placement'
    ? 'run-order'
    : options?.sortOrder) as CheckInSheetProps['sortOrder'],
};
```

**Step 3: Update generateResultsSheet signature and body**

```typescript
export const generateResultsSheet = (
  classInfo: ReportClassInfo,
  entries: Entry[],
  options?: { sortOrder?: 'placement' | 'armband' }
): void => {
```

Update props:

```typescript
const props: ResultsSheetProps = {
  classInfo,
  entries: scoredEntries,
  sortOrder: options?.sortOrder,
};
```

**Step 4: Update generateScoresheetReport signature and body**

```typescript
export const generateScoresheetReport = (
  classInfo: ScoresheetClassInfo,
  entries: Entry[],
  options?: { sortOrder?: ReportSortOrder; showSectionBadge?: boolean }
): void => {
```

Update props:

```typescript
const props: ScoresheetReportProps = {
  classInfo,
  entries,
  sortOrder: (options?.sortOrder === 'placement'
    ? 'run-order'
    : options?.sortOrder) as ScoresheetReportProps['sortOrder'],
  showSectionBadge: options?.showSectionBadge,
};
```

**Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

---

## Task 8: Create ScoresheetPrintDialog component

**Files:**

- Create: `apps/myk9q/src/components/dialogs/ScoresheetPrintDialog.tsx`

**Step 1: Create the dialog**

```tsx
/**
 * ScoresheetPrintDialog
 *
 * Lightweight dialog that appears when user clicks a print option.
 * Asks the user to choose sort order before printing.
 */

import React from 'react';
import { ClipboardList, ArrowUpDown, Hash, Trophy } from 'lucide-react';
import { DialogContainer } from './DialogContainer';
import './shared-dialog.css';

export type PrintSortOrder = 'run-order' | 'armband' | 'placement';

export interface ScoresheetPrintDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPrint: (sortOrder: PrintSortOrder) => void;
  title?: string;
  /** Override the two button labels and sort values. Defaults to Run Order / Armband Number. */
  options?: {
    primary: { label: string; sortOrder: PrintSortOrder };
    secondary: { label: string; sortOrder: PrintSortOrder };
  };
}

export const ScoresheetPrintDialog: React.FC<ScoresheetPrintDialogProps> = ({
  isOpen,
  onClose,
  onPrint,
  title,
  options,
}) => {
  const primary = options?.primary ?? {
    label: 'Run Order',
    sortOrder: 'run-order' as PrintSortOrder,
  };
  const secondary = options?.secondary ?? {
    label: 'Armband Number',
    sortOrder: 'armband' as PrintSortOrder,
  };

  const PrimaryIcon = primary.sortOrder === 'placement' ? Trophy : ArrowUpDown;

  return (
    <DialogContainer
      isOpen={isOpen}
      onClose={onClose}
      title={title || 'Print Scoresheet'}
      icon={<ClipboardList size={20} />}
      maxWidth="340px"
    >
      <p style={{ margin: '0 0 1rem', fontSize: '14px', color: '#666' }}>Sort entries by:</p>
      <div className="dialog-actions" style={{ gap: '0.75rem' }}>
        <button
          className="btn btn-primary"
          onClick={() => onPrint(primary.sortOrder)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          <PrimaryIcon size={16} />
          {primary.label}
        </button>
        <button
          className="btn btn-primary"
          onClick={() => onPrint(secondary.sortOrder)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          <Hash size={16} />
          {secondary.label}
        </button>
      </div>
    </DialogContainer>
  );
};
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit print enhancements (report components + dialog)**

```bash
git add apps/myk9q/src/components/reports/reportUtils.ts apps/myk9q/src/components/reports/CheckInSheet.tsx apps/myk9q/src/components/reports/ScoresheetReport.tsx apps/myk9q/src/components/reports/ResultsSheet.tsx apps/myk9q/src/services/reportService.ts apps/myk9q/src/components/dialogs/ScoresheetPrintDialog.tsx
git commit -m "feat(myk9q): add sort order to print reports and ScoresheetPrintDialog

Port from standalone myK9Q-React. Report components now accept sortOrder
prop. New ScoresheetPrintDialog lets users choose sort order before printing."
```

---

## Task 9: Integrate ScoresheetPrintDialog into print flows

This is the most complex task. Three separate print trigger paths need the sort dialog wired in:

1. **ClassList** (via `usePrintReports` hook)
2. **EntryList** (via `useEntryListHandlers`)
3. **CombinedEntryList** (inline handlers)

For each path, the pattern is:

- Instead of calling the generate function directly, open `ScoresheetPrintDialog`
- When user selects sort order, call the generate function with `{ sortOrder }`
- Close the dialog

**Files:**

- Modify: `apps/myk9q/src/pages/ClassList/hooks/usePrintReports.ts` — add options param to handlers
- Modify: `apps/myk9q/src/pages/ClassList/ClassList.tsx` — add dialog state, show dialog before printing
- Modify: `apps/myk9q/src/pages/ClassList/ClassListDialogs.tsx` — render `ScoresheetPrintDialog`
- Modify: `apps/myk9q/src/pages/EntryList/hooks/useEntryListHandlers.ts` — add options param
- Modify: `apps/myk9q/src/pages/EntryList/EntryList.tsx` — add dialog state
- Modify: `apps/myk9q/src/pages/EntryList/components/EntryListDialogs.tsx` — render dialog
- Modify: `apps/myk9q/src/pages/EntryList/CombinedEntryList.tsx` — add dialog state + render

### Step 1: Update usePrintReports hook to accept options

In `usePrintReports.ts`, update each handler to accept optional sort order.

Update `handleGenerateCheckIn` to accept and pass options:

```typescript
const handleGenerateCheckIn = useCallback(async (
  classId: number,
  deps: ReportDependencies,
  options?: { sortOrder?: ReportSortOrder }
): Promise<ReportOperationResult> => {
```

And pass it through: `generateCheckInSheet(reportClassInfo, entries, options);`

Same pattern for `handleGenerateResults` (with `{ sortOrder?: 'placement' | 'armband' }`) and `handleGenerateScoresheet` (with `{ sortOrder?: ReportSortOrder; showSectionBadge?: boolean }`).

Update the `UsePrintReportsReturn` interface signatures to match.

### Step 2: Wire dialog into ClassList

In `ClassList.tsx`, add state for which report type's dialog is open and the class ID:

```typescript
const [printDialogState, setPrintDialogState] = useState<{
  type: 'check-in' | 'results' | 'scoresheet' | null;
  classId: number | null;
}>({ type: null, classId: null });
```

Update the print callbacks to open the dialog instead of directly generating:

```typescript
const handleGenerateCheckIn = useCallback((classId: number) => {
  setPrintDialogState({ type: 'check-in', classId });
}, []);

const handleGenerateResults = useCallback((classId: number) => {
  setPrintDialogState({ type: 'results', classId });
}, []);

const handleGenerateScoresheet = useCallback((classId: number) => {
  setPrintDialogState({ type: 'scoresheet', classId });
}, []);
```

Add a handler for when the user picks a sort order:

```typescript
const handlePrintWithSortOrder = useCallback(
  async (sortOrder: PrintSortOrder) => {
    const { type, classId } = printDialogState;
    if (!type || !classId) return;

    setPrintDialogState({ type: null, classId: null });

    const reportDeps: ReportDependencies = {
      classes,
      trialInfo,
      licenseKey,
      organization,
      onComplete,
    };
    let result: ReportOperationResult;

    if (type === 'check-in') {
      result = await handleCheckInHook(classId, reportDeps, { sortOrder });
    } else if (type === 'results') {
      result = await handleResultsHook(classId, reportDeps, {
        sortOrder: sortOrder === 'run-order' ? 'placement' : 'armband',
      });
    } else {
      result = await handleScoresheetHook(classId, reportDeps, { sortOrder });
    }

    if (!result.success && result.error) {
      alert(result.error);
    }
  },
  [printDialogState, classes, trialInfo, licenseKey, organization]
);
```

Pass dialog state and handlers to `ClassListDialogs`.

### Step 3: Render dialog in ClassListDialogs

Add `ScoresheetPrintDialog` to `ClassListDialogs.tsx`:

```tsx
<ScoresheetPrintDialog
  isOpen={printDialogState.type !== null}
  onClose={() => setPrintDialogState({ type: null, classId: null })}
  onPrint={handlePrintWithSortOrder}
  title={
    printDialogState.type === 'check-in'
      ? 'Print Check-In Sheet'
      : printDialogState.type === 'results'
        ? 'Print Results'
        : 'Print Scoresheet'
  }
  options={
    printDialogState.type === 'results'
      ? {
          primary: { label: 'Placement', sortOrder: 'placement' },
          secondary: { label: 'Armband Number', sortOrder: 'armband' },
        }
      : undefined
  }
/>
```

### Step 4: [EXPANDED] Wire dialog into EntryList

**4a. Update `useEntryListHandlers.ts`** — Add options params to all 3 print handlers:

```typescript
// handlePrintCheckIn — add options param
const handlePrintCheckIn = useCallback(
  (options?: { sortOrder?: ReportSortOrder }) => {
    if (!classInfo) return;
    const orgData = parseOrganizationData(showContext?.org || '');
    const reportClassInfo: ReportClassInfo = {
      /* same as current */
    };
    generateCheckInSheet(reportClassInfo, localEntries, options);
  },
  [classInfo, showContext?.org, localEntries]
);

// handlePrintResults — add options param
const handlePrintResults = useCallback(
  (options?: { sortOrder?: 'placement' | 'armband' }) => {
    // same pattern, pass options to generateResultsSheet
  },
  [classInfo, showContext?.org, localEntries]
);

// handlePrintScoresheet — add options param
const handlePrintScoresheet = useCallback(
  async (options?: { sortOrder?: ReportSortOrder; showSectionBadge?: boolean }) => {
    // same pattern, pass options to generateScoresheetReport
  },
  [classInfo, showContext?.org, localEntries]
);
```

**4b. In `EntryList.tsx`** — Add print dialog state and wrap printOptions:

```typescript
import { ScoresheetPrintDialog, type PrintSortOrder } from '@/components/dialogs/ScoresheetPrintDialog';

// Add state (after other dialog states):
const [printDialogType, setPrintDialogType] = useState<'check-in' | 'results' | 'scoresheet' | null>(null);

// Replace printOptions onClick handlers to open dialog:
printOptions: [
  { label: 'Check-In Sheet', onClick: () => setPrintDialogType('check-in'), icon: 'checkin' },
  { label: 'Results Sheet', onClick: () => setPrintDialogType('results'), icon: 'results', disabled: completedEntries.length === 0 },
  { label: 'Scoresheet', onClick: () => setPrintDialogType('scoresheet'), icon: 'scoresheet' },
],

// Add sort order handler:
const handlePrintSortOrder = useCallback((sortOrder: PrintSortOrder) => {
  const type = printDialogType;
  setPrintDialogType(null);
  if (type === 'check-in') handlePrintCheckIn({ sortOrder });
  else if (type === 'results') handlePrintResults({ sortOrder: sortOrder === 'run-order' ? 'placement' : sortOrder as 'placement' | 'armband' });
  else if (type === 'scoresheet') handlePrintScoresheet({ sortOrder });
}, [printDialogType, handlePrintCheckIn, handlePrintResults, handlePrintScoresheet]);
```

**4c. Render dialog** — Add after `EntryListDialogs` in EntryList.tsx JSX:

```tsx
<ScoresheetPrintDialog
  isOpen={printDialogType !== null}
  onClose={() => setPrintDialogType(null)}
  onPrint={handlePrintSortOrder}
  title={
    printDialogType === 'check-in'
      ? 'Print Check-In Sheet'
      : printDialogType === 'results'
        ? 'Print Results'
        : 'Print Scoresheet'
  }
  options={
    printDialogType === 'results'
      ? {
          primary: { label: 'Placement', sortOrder: 'placement' },
          secondary: { label: 'Armband Number', sortOrder: 'armband' },
        }
      : undefined
  }
/>
```

**4d. Update `EntryListDialogs.tsx`** — The `onPrintCheckIn/Results/Scoresheet` props passed to `ClassOptionsDialog` also need to open the dialog. Pass `setPrintDialogType` as a prop and wire:

```tsx
onPrintCheckIn={() => setPrintDialogType('check-in')}
onPrintResults={() => setPrintDialogType('results')}
onPrintScoresheet={() => setPrintDialogType('scoresheet')}
```

### Step 5: [EXPANDED] Wire dialog into CombinedEntryList

**5a. Update print handlers** to accept options params (same as EntryList pattern):

```typescript
// [ADDED] All 5 handlers get options params:
const handlePrintCheckIn = useCallback((options?: { sortOrder?: ReportSortOrder }) => {
  // ... same as current, add options to generateCheckInSheet call
  generateCheckInSheet(reportClassInfo, entries, options);
}, [...]);

const handlePrintResultsSectionA = useCallback((options?: { sortOrder?: 'placement' | 'armband' }) => {
  // ... same, add options to generateResultsSheet call
  generateResultsSheet(reportClassInfo, sectionAEntries, options);
}, [...]);

// Same for handlePrintResultsSectionB

const handlePrintScoresheetSectionA = useCallback(async (options?: { sortOrder?: ReportSortOrder; showSectionBadge?: boolean }) => {
  // ... same, add options to generateScoresheetReport call
  // [ADDED] Pass showSectionBadge: true since this is a combined A/B view
  generateScoresheetReport(scoresheetClassInfo, sectionAEntries, { ...options, showSectionBadge: true });
}, [...]);

// Same for handlePrintScoresheetSectionB (also showSectionBadge: true)
```

**5b. Add dialog state and handler:**

```typescript
const [printDialogState, setPrintDialogState] = useState<{
  type: 'check-in' | 'results-a' | 'results-b' | 'scoresheet-a' | 'scoresheet-b' | null;
}>({ type: null });

const handlePrintSortOrder = useCallback(
  (sortOrder: PrintSortOrder) => {
    const { type } = printDialogState;
    setPrintDialogState({ type: null });
    const resultsSortOrder =
      sortOrder === 'run-order' ? 'placement' : (sortOrder as 'placement' | 'armband');
    if (type === 'check-in') handlePrintCheckIn({ sortOrder });
    else if (type === 'results-a') handlePrintResultsSectionA({ sortOrder: resultsSortOrder });
    else if (type === 'results-b') handlePrintResultsSectionB({ sortOrder: resultsSortOrder });
    else if (type === 'scoresheet-a') handlePrintScoresheetSectionA({ sortOrder });
    else if (type === 'scoresheet-b') handlePrintScoresheetSectionB({ sortOrder });
  },
  [printDialogState, ...handlers]
);
```

**5c. Update printOptions to open dialog:**

```typescript
printOptions: [
  { label: 'Check-In Sheet (A & B)', onClick: () => setPrintDialogState({ type: 'check-in' }), icon: 'checkin' },
  { label: 'Results - Section A', onClick: () => setPrintDialogState({ type: 'results-a' }), icon: 'results', disabled: ... },
  { label: 'Results - Section B', onClick: () => setPrintDialogState({ type: 'results-b' }), icon: 'results', disabled: ... },
  { label: 'Scoresheet - Section A', onClick: () => setPrintDialogState({ type: 'scoresheet-a' }), icon: 'scoresheet' },
  { label: 'Scoresheet - Section B', onClick: () => setPrintDialogState({ type: 'scoresheet-b' }), icon: 'scoresheet' },
],
```

**5d. Render dialog** — Add to CombinedEntryList JSX:

```tsx
<ScoresheetPrintDialog
  isOpen={printDialogState.type !== null}
  onClose={() => setPrintDialogState({ type: null })}
  onPrint={handlePrintSortOrder}
  title={
    printDialogState.type?.startsWith('results')
      ? 'Print Results'
      : printDialogState.type?.startsWith('scoresheet')
        ? 'Print Scoresheet'
        : 'Print Check-In Sheet'
  }
  options={
    printDialogState.type?.startsWith('results')
      ? {
          primary: { label: 'Placement', sortOrder: 'placement' },
          secondary: { label: 'Armband Number', sortOrder: 'armband' },
        }
      : undefined
  }
/>
```

### Step 6: Verify typecheck and test

Run: `pnpm typecheck`
Run: `cd apps/myk9q && pnpm test`
Expected: PASS

### Step 7: Commit

```bash
git add apps/myk9q/src/pages/ClassList/ apps/myk9q/src/pages/EntryList/ apps/myk9q/src/pages/EntryList/hooks/
git commit -m "feat(myk9q): integrate sort order dialog into all print flows

ClassList, EntryList, and CombinedEntryList now show ScoresheetPrintDialog
before generating reports, letting users choose sort order."
```

---

## Task 10: Improve AboutDialog PWA update UX

**Files:**

- Modify: `apps/myk9q/src/components/dialogs/AboutDialog.tsx`

**Step 1: Add 'updating' state and statusRef**

Change the updateStatus type union (line 16-18) from:

```typescript
const [updateStatus, setUpdateStatus] = useState<
  'idle' | 'checking' | 'up-to-date' | 'update-available'
>('idle');
```

To:

```typescript
const [updateStatus, setUpdateStatus] = useState<
  'idle' | 'checking' | 'up-to-date' | 'update-available' | 'updating'
>('idle');
const statusRef = useRef(updateStatus);
useEffect(() => {
  statusRef.current = updateStatus;
}, [updateStatus]);
```

**Step 2: Add checkWaiting useEffect**

After the timer cleanup effect, add:

```typescript
// When dialog opens, check if there's already a waiting SW
useEffect(() => {
  if (!isOpen || !('serviceWorker' in navigator)) return;

  const checkWaiting = async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        setUpdateStatus('update-available');
      }
    } catch {
      // Ignore
    }
  };
  checkWaiting();

  return () => {
    setUpdateStatus('idle');
  };
}, [isOpen]);
```

**Step 3: Replace applyUpdate with improved version**

Replace the existing `applyUpdate` callback (lines 76-86) with:

```typescript
const applyUpdate = useCallback(async () => {
  setUpdateStatus('updating');
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.waiting) {
      setUpdateStatus('up-to-date');
      const timer = setTimeout(() => {
        if (statusRef.current === 'up-to-date') setUpdateStatus('idle');
      }, 4000);
      timersRef.current.push(timer);
      return;
    }

    registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });

    const timer = setTimeout(() => window.location.reload(), 3000);
    timersRef.current.push(timer);
  } catch (error) {
    logger.warn('[About] Failed to apply update:', error);
    window.location.reload();
  }
}, []);
```

**Step 4: Replace checkForUpdates with improved version**

Replace the existing `checkForUpdates` callback (lines 33-74) with the standalone's version that tracks installing workers:

```typescript
const checkForUpdates = useCallback(async () => {
  if (!('serviceWorker' in navigator)) return;

  setUpdateStatus('checking');
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      setUpdateStatus('idle');
      return;
    }

    if (registration.waiting) {
      setUpdateStatus('update-available');
      return;
    }

    let foundUpdate = false;

    const trackInstalling = (sw: ServiceWorker) => {
      foundUpdate = true;
      const onStateChange = () => {
        if (sw.state === 'installed') {
          sw.removeEventListener('statechange', onStateChange);
          setUpdateStatus('update-available');
        }
      };
      if (sw.state === 'installed') {
        setUpdateStatus('update-available');
      } else {
        sw.addEventListener('statechange', onStateChange);
      }
    };

    if (registration.installing) {
      trackInstalling(registration.installing);
      return;
    }

    const onUpdateFound = () => {
      registration.removeEventListener('updatefound', onUpdateFound);
      if (registration.installing) {
        trackInstalling(registration.installing);
      }
    };
    registration.addEventListener('updatefound', onUpdateFound);

    await registration.update();

    const checkTimer = setTimeout(() => {
      registration.removeEventListener('updatefound', onUpdateFound);
      if (!foundUpdate) {
        setUpdateStatus('up-to-date');
        const resetTimer = setTimeout(() => {
          if (statusRef.current === 'up-to-date') setUpdateStatus('idle');
        }, 4000);
        timersRef.current.push(resetTimer);
      }
    }, 3000);
    timersRef.current.push(checkTimer);
  } catch (error) {
    logger.warn('[About] Update check failed:', error);
    setUpdateStatus('idle');
  }
}, []);
```

**Step 5: Update button to handle 'updating' state**

Change the icon import (line 2): replace `Download` with `Loader2`.

Update the button `disabled` prop:

```typescript
disabled={updateStatus === 'checking' || updateStatus === 'updating'}
```

Update the cursor style:

```typescript
cursor: (updateStatus === 'checking' || updateStatus === 'updating') ? 'wait' : 'pointer',
```

Add the 'updating' color case:

```typescript
color:
  updateStatus === 'up-to-date'
    ? 'var(--status-qualified)'
    : updateStatus === 'update-available' || updateStatus === 'updating'
      ? 'var(--primary)'
      : 'var(--muted-foreground)',
```

Add the 'updating' render block after the 'update-available' block:

```tsx
{
  updateStatus === 'updating' && (
    <>
      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
      Updating...
    </>
  );
}
```

**Step 6: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

---

## Task 11: Add isUpdating state to UpdateToast

**Files:**

- Modify: `apps/myk9q/src/components/ui/UpdateToast.tsx`

**Step 1: Add CheckCircle to imports**

Update line 1: `import { RefreshCw, CheckCircle } from 'lucide-react';`

**Step 2: Add isUpdating prop**

Update the interface:

```typescript
interface UpdateToastProps {
  onUpdate: () => void;
  onLater: () => void;
  /** Whether the update is currently being applied */
  isUpdating?: boolean;
}
```

**Step 3: Update the component to use isUpdating**

Update the function signature:

```typescript
export function UpdateToast({ onUpdate, onLater, isUpdating }: UpdateToastProps) {
```

Add `isUpdating` Tailwind style for the icon:

```typescript
icon: cn(
  "flex-shrink-0 flex items-center justify-center",
  "w-10 h-10 rounded-[var(--token-radius-md)]",
  isUpdating
    ? "bg-[color-mix(in_srgb,var(--status-qualified)_15%,transparent)] text-[var(--status-qualified)]"
    : "bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]"
),
```

Note: Since styles use `cn()` at module level, the `isUpdating`-dependent style needs to move inside the component. Refactor the icon style to be computed inline:

```tsx
<div
  className={cn(
    'flex-shrink-0 flex items-center justify-center',
    'w-10 h-10 rounded-[var(--token-radius-md)]',
    isUpdating
      ? 'bg-[color-mix(in_srgb,var(--status-qualified)_15%,transparent)] text-[var(--status-qualified)]'
      : 'bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]'
  )}
>
  {isUpdating ? <CheckCircle size={24} /> : <RefreshCw size={24} />}
</div>
```

Update the message:

```tsx
<p id="update-toast-message" className={styles.message}>
  {isUpdating
    ? 'Updating... reloading shortly.'
    : 'myK9Q has been updated! Tap to load new features.'}
</p>
```

Conditionally render buttons:

```tsx
{
  !isUpdating && (
    <div className={styles.actions}>
      <button className={cn(styles.btn, styles.btnPrimary)} onClick={onUpdate}>
        Update Now
      </button>
      <button className={cn(styles.btn, styles.btnSecondary)} onClick={onLater} autoFocus>
        Later
      </button>
    </div>
  );
}
```

**Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

---

## Task 12: Add applySwUpdate to main.tsx

**Files:**

- Modify: `apps/myk9q/src/main.tsx`

**Step 1: Add applySwUpdate function**

Before the `showUpdateToast` function, add:

```typescript
/**
 * Apply a waiting service worker update: post SKIP_WAITING, show feedback, then reload.
 */
const applySwUpdate = async (toastRoot: ReactDOM.Root) => {
  toastRoot.render(
    <UpdateToast onUpdate={() => {}} onLater={() => {}} isUpdating />
  );

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
    setTimeout(() => window.location.reload(), 3000);
  } catch {
    setTimeout(() => window.location.reload(), 500);
  }
};
```

**Step 2: Update handleUpdate to use applySwUpdate**

Replace the existing `handleUpdate` (line 74-77):

```typescript
const handleUpdate = () => {
  toastRoot.unmount();
  updateSW(true);
};
```

With:

```typescript
const handleUpdate = () => {
  applySwUpdate(toastRoot);
};
```

**Step 3: [ADDED] Clean up unused `updateSW` variable**

After replacing `handleUpdate`, the `updateSW` return value from `registerSW(...)` is no longer used. Change the `registerSW(...)` call to not capture the return value:

```typescript
// Before:
const updateSW = registerSW({
  onNeedRefresh() { ... },
  ...
});

// After:
registerSW({
  onNeedRefresh() { ... },
  ...
});
```

If other code references `updateSW`, search for it and remove those references too.

**Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit PWA update UX improvements**

```bash
git add apps/myk9q/src/components/dialogs/AboutDialog.tsx apps/myk9q/src/components/ui/UpdateToast.tsx apps/myk9q/src/main.tsx
git commit -m "fix(myk9q): improve PWA update detection and apply UX

Port from standalone myK9Q-React. AboutDialog now shows 'Updating...'
state with visual feedback, tracks installing workers for better update
detection. UpdateToast shows feedback during update application."
```

---

## Task 13: Run full test suite and verify build

**Step 1: [ADDED] Check existing tests for compatibility**

The `usePrintReports` hook handlers now accept an optional `options` parameter. Existing tests in `apps/myk9q/src/pages/ClassList/hooks/usePrintReports.test.ts` may need mock updates if they verify function signatures or spy on `generateCheckInSheet`, `generateResultsSheet`, or `generateScoresheetReport`. Check that:

- Mocked generate functions still match updated signatures (new optional `options` param)
- Any assertions on call args account for the new parameter

Similarly check `useEntryListHandlers` tests if they exist.

**Step 2: Run tests**

Run: `cd apps/myk9q && pnpm test`
Expected: PASS

**Step 3: Verify build**

Run: `pnpm build`
Expected: PASS

**Step 4: Fix any issues discovered**

If tests or build fail, fix the issues before proceeding. Common fixes:

- Update mocked function signatures to accept optional `options` param
- Add `options` to spy call expectations where needed

---

## Implementation Order Summary

| Task | Feature                          | Risk                                      |
| ---- | -------------------------------- | ----------------------------------------- |
| 1    | Add qrcode.react dep             | Low                                       |
| 2    | ShowFlyer component              | Low (new file)                            |
| 3    | reportService: ShowFlyer         | Low (additive)                            |
| 4    | TrialSecretary integration       | Low (additive)                            |
| 5    | sortByArmband utility            | Low (additive)                            |
| 6    | Report component sortOrder props | Low                                       |
| 7    | reportService: sort options      | Low                                       |
| 8    | ScoresheetPrintDialog            | Low (new file)                            |
| 9    | Wire dialog into print flows     | **High** (touches 7+ files, 3 code paths) |
| 10   | AboutDialog PWA improvements     | Medium                                    |
| 11   | UpdateToast isUpdating           | Low                                       |
| 12   | main.tsx applySwUpdate + cleanup | Low                                       |
| 13   | Test compat + full test + build  | Verification                              |
