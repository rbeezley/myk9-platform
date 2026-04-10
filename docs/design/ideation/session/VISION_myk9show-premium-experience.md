# Vision: myK9Show — The Premium Dog Show Experience

**From:** Multi-agent ideation session, 2026-02-20
**Concept seed:** "A premium dog show management experience — what would make myK9Show the app every exhibitor and show secretary can't live without?"

---

## What This Is

This document captures the product direction that emerged from a structured ideation session exploring what would make myK9Show indispensable. It is not a PRD or a feature spec. It is a vision — the conceptual ground that requirements can be built on. The supporting brainstorming materials (idea briefs, ideation graph, snapshots) are preserved in the session folder for anyone who wants the full process and reasoning.

---

## The Core Thesis

Dog showing is a career, not a transaction. Exhibitors don't enter shows at random — they are pursuing titles, accumulating points, tracking judges, and planning strategically across shows and seasons. Show secretaries don't manage isolated events — they are building shows that attract the right exhibitors, solve complex scheduling constraints, and advance their clubs' reputations over years.

No tool on the market treats dog showing this way. Existing tools manage individual events. myK9Show sees the arc — for both exhibitors and secretaries — and makes it visible, navigable, and intelligent.

The session's one-line version: **"The app understands that dog showing is a career, not a transaction, and that insight benefits both sides of the market."**

---

## The Governing Principle

**myK9Show does the work you were going to do anyway, but better, faster, and with insights you couldn't generate yourself.**

Every exhibitor already calculates points, tracks judges, and plans entries. Every secretary already builds schedules, manages conflicts, and compiles reports. The app doesn't add new tasks. It takes the tasks people already care about — the mental math, the spreadsheet gymnastics, the paper trail — and does them with an intelligence and immediacy that makes going back unthinkable.

The emotional contract: the app *knows what you're trying to accomplish* and helps you get there. For exhibitors, that means understanding their dog's career. For secretaries, that means understanding their show's complexity. For both, it means the software feels like it's working alongside you, not waiting to be told what to do.

---

## Three Moves

The session produced a three-layer architecture. These are not three features. They are three aspects of one integrated product, described through the metaphor the session itself developed: **soul, spine, and moat.**

### Move 1: The Career Narrative (the soul)

*This is why exhibitors open the app when there's no show to manage.*

myK9Show tracks each dog's show career as a continuous story — progress toward titles, results history, judge performance, and competitive standing. The app makes visible what exhibitors already track in their heads and notebooks, and adds strategic intelligence they couldn't generate themselves.

**The Post-Show Moment** is how people discover this. After a show where the secretary used myK9Show, exhibitors receive an automatic career update: "Rex earned 2 points today. He now has 13 of 15 toward his Championship. Here's what today's win means." The exhibitor didn't sign up. Value arrived uninvited. Each show becomes a distribution event — exhibitors experience the career narrative by being entered in a show that uses the platform.

**The Tuesday Screen** is why they come back. Between shows, the app shows progress bars toward titles, strategic recommendations for upcoming shows, and judge history ("Rex has shown under Judge Chen twice — placed 1st both times"). This is the fitness tracker energy: you open it because you want to see the number. The app has something interesting to show you even when there's no show to manage.

**Competitive Awareness** is the social layer, but sideways. Not friend lists and feeds — leaderboards and standings. The tournament bracket, not the social network. "#1 Golden Retriever in the region just entered the same show as you." The app makes the competition visible. People do the socializing themselves.

**The First Chapter** is how newcomers enter the story. For novices, the emotional hook is not progress (they have none) but belonging. "Cooper: 1 show, 0 points. Chapter 1 of many." The career narrative begins with aspiration — a map of where you're going — and contextual guidance during early shows acts as the mentor every newcomer wishes they had.

The Post-Show Moment is the hook. The Tuesday Screen is the habit. The career narrative is the thread that connects them. They are two halves of the same story — and the product must nail both independently.

### Move 2: The Intelligent Show Design Engine (the spine)

*This is why secretaries can't go back to spreadsheets.*

myK9Show treats show scheduling as the constraint-satisfaction problem it actually is. A typical all-breed show has 150-200+ breeds, 7 groups, 6-10 judges, 4-8 rings — with cascading constraints that secretaries currently manage by hand. The show design engine makes this complexity visible and solvable.

**Conflict-Aware Design** is the planning experience. A real-time dashboard showing all conflicts — judge overlaps, exhibitor time gaps, ring collisions, venue constraints — that updates instantly as the secretary makes changes. Combined with what-if simulation: "What happens if Judge Smith cancels? What if entries in Sporting are 20% higher than expected?" The secretary answers in seconds questions that currently take hours. It's Google Maps for dog shows — you don't plan a route and then check if it works; you see it updating as you adjust.

**Adaptive Show Day** is the execution experience. Show day never goes according to plan. The schedule is alive: when a breed finishes early or a judge runs late, the system adjusts downstream and pushes updates to exhibitors' phones. "Ring 3 is running 15 minutes ahead. Your breed has been moved up. Updated time: 2:15pm." This is the show-day version of the Post-Show Moment — delivering value at the moment of highest emotional stakes.

**Shared Visibility** is the collaboration experience. Show committees need transparency, not simultaneous editing. The show chair, superintendent, and chief ring steward all see the same live dashboard — the current schedule, recent changes, active conflicts. One person builds; the committee sees. Nobody has to ask "where are we?" by email.

The career narrative makes exhibitors love the app. The show design engine makes secretaries depend on it. Love and dependence are both paths to "can't live without," and the best products have both.

### Move 3: The Emergent Intelligence Layer (the moat)

*This is what competitors can't replicate by building either pillar alone.*

When career data and show design data share a platform, capabilities emerge that neither system could produce independently. The app transitions from tracker and planner to *strategist*.

**Smart Entry Recommendations** combine an exhibitor's career state with show structural data: "The Riverside cluster has Judge Chen on Saturday. You've done well under Chen — 1st, 2nd. Saturday entries suggest a probable major. Enter Saturday for the major chance. Enter Sunday to build data on a new judge." This is the advice an experienced handler gives over coffee. The app gives it to everyone, all the time, with current data.

**Cross-Show Campaign Optimization** extends this across multiple shows: "Springfield cluster — 4 shows over 2 days. Enter Shows 1 and 3 for best major probability. Skip Show 2. Enter Show 4 only if Show 1 doesn't produce your major." Exhibitors manage cluster strategy through intuition today. The app makes it data-driven. You're not managing individual shows — you're managing a campaign.

The two pillars don't just sit next to each other. Their data intersection creates a platform intelligence layer that is the long-term competitive advantage. A competitor could build career tracking. A competitor could build show scheduling. What they can't easily replicate is the intelligence that emerges from having both in the same system.

---

## How They Fit Together

The three moves form a reinforcing system, not a feature list.

The **career narrative** creates exhibitor engagement. That engagement produces data — career state, judge history, entry patterns, competitive standings. That data flows into the **show design engine**, giving secretaries predictive entry intelligence ("your show is projected to have a major in Golden Retrievers") that makes their shows better. Better shows attract more exhibitors. More exhibitors produce more career data. More career data makes the **intelligence layer** smarter — better recommendations, more accurate projections, richer competitive landscape. Smarter intelligence makes the career narrative more valuable. The cycle accelerates.

The meta-principle is that the same data serves different users differently without either user needing to understand the other's experience. An exhibitor sees progress toward a title. A secretary sees projected entry counts. The intelligence layer sees an optimization opportunity. One data model, three experiences. That's why this is a platform, not a collection of features.

The natural arc of the user experience: a secretary runs a show on myK9Show. Exhibitors at that show receive post-show career updates. They start tracking their careers. They ask other secretaries to use myK9Show so their career data stays complete. More secretaries adopt. The network grows. The intelligence improves. "Each show becomes a distribution event."

---

## Boundaries

Things the session explicitly decided the product is NOT:

- **Not a social network.** The instinct to build community features was explored and rejected. Facebook groups already own the social layer of dog showing. myK9Show's social play is competitive awareness — leaderboards and standings, not friend lists and feeds. Making careers visible is the social strategy. People will do the socializing themselves.

- **Not a tool for spectators (yet).** The spectator mode concept was explored in depth and grounded as a strategic play for year 2-3, not a core differentiator. The sport's demographic pipeline problem is real, but solving it is a different question than making the app indispensable for current users. The novice exhibitor angle (the "first chapter" of a career) was extracted and kept; the broader spectator vision was deferred.

- **Not a breeding program manager.** Multi-generational tracking (breeding program career trees) was proposed and parked. It introduces breeders as a third audience before the exhibitor and secretary experiences are nailed. It's a natural future extension — "a 10-year relationship with the app, not a per-show transaction" — but it's not "what is the product."

- **Not a B2B data analytics platform (yet).** The Health of the Sport Dashboard (aggregate data for kennel clubs and breed organizations) was proposed and deferred. It requires massive platform adoption to produce statistically meaningful data. It's a compelling eventual business model extension, not a current product direction.

- **Not a gamification platform.** The career narrative tracks real progress toward real titles. The session explicitly pulled back from RPG-style skill trees and unlock mechanics. The right metaphor is a fitness tracker (simple, addictive, you check the number) not a video game.

---

## Key Design Decisions

Things the session treated as settled:

- **The fitness tracker is the anchor metaphor for exhibitor engagement.** You open the app because you want to see the number. Progress bars, not skill trees. Simple, addictive, emotionally resonant.

- **The Post-Show Moment is the primary acquisition mechanism.** Value arrives uninvited. The exhibitor didn't sign up. The secretary used the app, results flowed, the career update appeared. Zero-effort onboarding. "You don't ask for permission, you just deliver something so obviously useful that opting out feels stupid."

- **Hook and habit are separate design challenges.** The Post-Show Moment is the hook (first taste of value). The Tuesday Screen is the habit (reason to come back). They share a data model but must be designed and tested as two independent experiences.

- **The show design engine treats scheduling as a constraint-satisfaction problem.** Not a calendar with manual scheduling. An intelligent system that understands rules, detects conflicts, simulates scenarios, and adapts in real time.

- **Collaboration means shared visibility, not co-editing.** One person builds the schedule. The committee sees changes, conflicts, and status. Transparency, not simultaneous editing.

- **Competitive awareness replaces social features.** Leaderboards, not friend lists. Standings, not feeds. The tournament bracket, not the social network.

- **Novice onboarding is through the career narrative, not a separate experience.** The "first chapter" serves newcomers through the same framework that serves veterans — different emotional register (belonging vs. progress) but same data model and product architecture.

---

## Open Questions

### 1. How does the Post-Show Moment reach exhibitors who haven't signed up?

Entry forms contain email addresses. But the first unsolicited contact needs to feel like a gift, not spam. The exact content, timing, and tone of this first touch determines whether the acquisition model works or creates backlash. This is a design problem with regulatory implications (email consent, GDPR-style considerations) that needs careful resolution.

### 2. What happens when career data is incomplete?

If some shows use myK9Show and others don't, career pictures have gaps. The app needs to either import historical results from external sources (AKC records, existing databases) or handle partial data gracefully. The gap between "complete career picture" (the promise) and "partial data from the shows that use our platform" (the reality, especially early) is a critical UX challenge.

### 3. How good does the constraint solver need to be at launch?

Show secretaries have decades of intuition about scheduling. If the engine produces schedules that experienced secretaries find obviously suboptimal, trust is damaged rather than built. The minimum viable intelligence level — what the solver must be able to do on day one to be credible — needs definition.

### 4. What's the minimum platform density for the intelligence layer?

Smart Entry Recommendations and Cross-Show Campaign Optimization require data from multiple shows and many exhibitors. Below some threshold, the recommendations will be unreliable. What's that threshold, and how does the app provide value during the growth phase before it's reached?

### 5. Where is the monetization line? (Partially resolved)

A convergent round at the end of the session produced a monetization framework that maps directly to the three-layer architecture:

**Free Tier — "The Hook and the Habit":** Post-Show Moment notifications, basic career page (show history, points, titles), basic show creation and entry management, and the conflict detection dashboard for secretaries. The governing principle: everything that creates data or drives the flywheel is free. Free users are the network — they generate the career data that makes premium tiers valuable.

**Premium Tier — "The Intelligence" (~$9.99-14.99/month or ~$99-149/year for exhibitors):** Judge history and performance analysis, strategic show recommendations, Smart Entry Recommendations, Cross-Show Campaign Optimization, competitive awareness, advanced career analytics. The principle: the free tier tells you where you are, the premium tier tells you where to go. Same model as fitness trackers: step count is free, training plan is premium.

**Professional Tier — "The Engine" (per-show pricing for secretaries/clubs, ~$99-299 per show):** Full show design engine (what-if simulator, adaptive show day, shared visibility), predictive entry intelligence, auto-generated post-show reports, dynamic show marketing tools. Per-show pricing recommended over annual subscription: lower trial barrier for volunteer organizations, every show is both revenue and distribution event, and clubs naturally upgrade to annual plans as usage grows.

The key structural insight: the free tier is not a loss leader — it is the **data acquisition layer**. The more free users generating career data, the more valuable premium recommendations become. This is a platform model where free usage creates the network effects that premium users pay to leverage.

**What remains unresolved:** The conflict dashboard being free (as proposed) could cannibalize professional tier value — the line between "free conflict visibility" and "premium what-if simulation" needs precise definition. The exact per-show pricing tiers by show size need market testing. And the transition from per-show to annual subscription needs specific trigger points.

---

## What Wasn't Explored

Territory the session identified but didn't enter:

- **The handler/agent perspective.** Professional handlers manage multiple dogs for multiple owners. Their workflow is different from an owner-exhibitor's. The career narrative maps naturally to this ("manage your roster") but the session focused on owner-exhibitors and didn't explore handler-specific needs.

- **Performance events (obedience, agility, rally).** All examples focused on conformation (breed) showing. Performance events have different career structures, different title paths, and different competitive dynamics. The framework should extend but the session didn't test it.

- **International showing.** Dog shows exist globally with different registries (AKC, KC, FCI). The career narrative assumes AKC-style points and titles. International extension is a scope question the session didn't address.

- **Integration with existing platforms.** InfoDog, ShowEdge, and other incumbent tools handle entry processing. The session discussed what myK9Show should *be* but not how it coexists with or replaces existing infrastructure during transition.

- **The data acquisition strategy.** How does the platform bootstrap career data for exhibitors who join after years of showing? AKC data import, manual entry, third-party data sources — this infrastructure question was identified but not resolved.
