Club Page UI/UX Review & Recommendations
What's Working Well
Consistent Design System - Uses shadcn/ui components with Tailwind CSS consistently
Responsive Layout - Collapsible sidebar with mobile support via SidebarLayout
Information Hierarchy - Clear header with logo, stats cards, and tabbed content
RBAC Integration - Permission-based actions (Add Member, Edit Club, etc.)
Offline-First Architecture - Uses replication store for local-first data
Areas for Improvement
1. Header Section Overload (ClubDetails.tsx:345-453)
Issue: The header contains too much information packed together - logo, name, club number, email, phone, website, address, and badges all in one card.

Recommendations:

Move contact details (email, phone, website) to the "About" tab or a dedicated "Contact" tab
Keep header focused: logo, name, club type badge, and quick actions
Consider a "Quick Contact" button that reveals a popover instead of showing all info
2. Statistics Cards Have Mock/Hardcoded Data (ClubDetails.tsx:107-137)
Issues:

upcomingEvents = upcomingShows + 2 is hardcoded
Trend percentages (+15%, +8%, +6%, +12%) are arbitrary
Progress bars don't represent meaningful metrics
Recommendations:

Remove fake trend data or calculate real trends from historical data
Replace progress bars with meaningful visualizations (e.g., monthly show chart)
Consider removing stats cards if data isn't real - empty/fake data erodes trust
3. Show Cards Use Mock Metadata (ClubDetails.tsx:152-163)
Issue: getShowMetadata() generates random entry counts and judges.

Recommendation: Either fetch real show data or remove the metadata section until real data is available. Show only what's known (date, location, description).

4. Tab Naming Inconsistency (ClubDetails.tsx:503-514)
Issue: "Description" tab is named differently from other tabs which use noun forms.

Recommendation: Rename to "About" for consistency:

Upcoming Shows ✓
Past Shows ✓
About (instead of "Description")
Members ✓
5. Empty States Are Good But Could Be Better
Current: Generic empty states with icons and single CTA.

Recommendations:

Add contextual tips (e.g., "Shows you create will automatically appear here")
For Past Shows, don't show "Browse Other Clubs" button - it's not a real feature
Consider onboarding steps for new clubs
6. Member List Missing Avatar/Photo (MemberList.tsx)
Issue: Member cards only show text - no visual identity.

Recommendation: Add avatar images for members (fallback to initials like the sidebar does for clubs).

7. "Member Since" Uses Current Date (MemberList.tsx:102-104)
Issue: Hardcoded to new Date().toLocaleDateString() - always shows today.

Recommendation: Store actual join date or remove this field until real data exists.

8. Edit Panel Tab Organization (ClubEditPanel.tsx)
Current: Basic Info | Contact | Details

Recommendations:

"Details" is vague - rename to "Classification" or merge with Basic Info
Club Type and Founded date could fit in Basic Info tab
Reduces cognitive load (2 tabs vs 3)
9. No Loading States for Actions
Issue: Button clicks (delete, save) don't show loading indicators inline.

Recommendation: Add loading spinners to action buttons during async operations.

10. Dropdown Menu Actions May Not Work (ClubDetails.tsx:369-379)
Issue: Several dropdown items just log actions without real functionality:

"Visit Website" logs instead of navigating
"View Awards" and "View Photos" only log
Recommendation: Either implement the features or remove the menu items. Dead links frustrate users.

Quick Wins (Low Effort, High Impact)
Change	File	Line
Rename "Description" tab to "About"	ClubDetails.tsx	509
Remove fake trend percentages from stats	ClubDetails.tsx	113-132
Remove "Browse Other Clubs" button (not functional)	ClubDetails.tsx	705-708
Fix "Member since" to show real date or remove	MemberList.tsx	102-104
Make "Visit Website" actually open the URL	ClubDetails.tsx	377-379
Structural Improvements (Medium Effort)
Simplify Header - Move contact info to About tab
Remove Mock Data - Show only real data from the database
Add Member Avatars - Visual improvement for member list
Loading States - Add spinners to async action buttons