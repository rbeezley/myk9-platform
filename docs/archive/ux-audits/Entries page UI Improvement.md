Entries

can you review the entries page UI\UX and make recommendations on how to improve it?

Entries Page UX Review & Recommendations
Current Strengths
Clean Apple-inspired design with consistent styling
Good use of status badges for visual clarity
Progress indicators show entry completion state
Proper loading and empty states exist
Issues & Recommendations
1. Information Overload - Progress Section
Issue: The "Entry Progress" percentage (lines 726-735) is confusing. Users don't understand what 50%, 75%, or 100% means in context.

Recommendation: Replace the generic progress bar with a clear status stepper showing discrete states:

Submitted → Under Review → Accepted → Payment Complete

This makes the entry lifecycle transparent and actionable.

2. Hardcoded Fake Trend Data
Issue: The stat cards show fake trend percentages like "+5%", "+12%", "-3%" (lines 537, 565, 595, 628) that are not calculated from real data.

Recommendation: Either:

Calculate real trends (comparing current month to previous)
Remove trend indicators entirely
Show meaningful context like "2 upcoming" instead
3. Tab Count Redundancy
Issue: Each tab shows a count (e.g., "Pending (3)"), and the stat cards above show the same numbers. This creates visual redundancy.

Recommendation: Remove counts from tabs or simplify the stat cards to show only key metrics (upcoming shows, action needed).

4. Missing Primary Action
Issue: No prominent "Enter a Show" CTA on the page. Users must navigate elsewhere to enter shows.

Recommendation: Add a primary action button in the header area:

[+ Enter a Show]  [Refresh]

5. Classes Section Lacks Hierarchy
Issue: All classes are displayed equally with check-in indicators inline (lines 759-787). The check-in button is small and the clickable area is unclear.

Recommendation:

Group classes by day if multi-day show
Make check-in status more prominent with larger touch targets
Add run order/ring assignment when available
6. "Last Updated" Is Vague
Issue: "Last updated: 1/15/2026" (line 793) doesn't tell users what changed.

Recommendation: Show more actionable info:

"Accepted 2 days ago"
"Payment pending since Jan 10"
"Check-in opens Jan 20"
7. Receipt Button Always Visible
Issue: Receipt button shows for any entry with a confirmation number, even pending entries (lines 820-830).

Recommendation: Only show Receipt for entries with PaymentStatus.PAID_* to avoid confusion.

8. Mobile Tab Overflow
Issue: 5 tabs on mobile (All, Pending, Accepted, Waitlist, Upcoming) likely cause horizontal scroll or cramped layout.

Recommendation:

Use a dropdown/select on mobile for filtering
Or reduce to 3 primary tabs: All, Action Needed, History
9. Check-In Flow Is Hidden
Issue: Check-in is buried inside each class item as a small indicator. Users may not realize they can self-check-in.

Recommendation:

Add a dedicated "Check In" section for shows happening today/tomorrow
Show check-in window timing ("Check-in opens at 7:00 AM")
Make check-in buttons more prominent with countdown
10. No Batch Actions
Issue: Each entry must be managed individually.

Recommendation: For users with multiple entries at the same show, allow:

Batch check-in for all classes
View all dogs entered in a single show together
11. Empty State Could Be More Helpful
Issue: Empty state says "You haven't entered any shows yet" with a generic "Browse All Shows" button.

Recommendation: Make it more helpful:

Show upcoming shows in user's area
Highlight shows with open registration
Add quick filters: "Shows Near Me", "Shows This Month"
Summary of High-Priority Changes
Priority	Issue	Impact
High	Remove fake trend data	Builds trust
High	Add "Enter Show" CTA	Increases conversions
High	Improve mobile tabs	Better mobile UX
Medium	Replace progress bar with stepper	Clearer status
Medium	Make check-in more prominent	Day-of-show UX
Low	Batch actions	Power user feature