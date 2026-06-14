# myk9show.com Landing Page Critique — May 2026

Reviewed: 2026-05-14
URL: https://myk9show.com
Method: Screenshots (React app, web_fetch couldn't render JS)

## Top-line assessment

The landing page exists and has structure — hero, feature cards, pricing, FAQ — but it is generic and works against the strategic positioning. It looks like a generic dog show management product, not "the platform built by the team behind mySWT, myNWT, and myK9Q." Most of the strategic differentiation discussed in onboarding (scent sports specialization, offline-first, ringside integration, 13-year credibility, two-sided platform) is absent.

## Critical issues

1. **Cyborg dog hero image.** Signals "tech-bro AI startup" not "trustworthy dog show partner." Wrong for the audience. Replace with real photography of real dogs at real trials.

2. **"Welcome to myK9Show" hero copy is generic.** Doesn't say who it's for or why to care. Wastes prime real estate.

3. **Search bar as primary CTA is broken.** Returns nothing if no shows are loaded. Confusing.

4. **"View Premium Pricing Plans" as secondary CTA is premature.** Pricing before value is established.

5. **Six feature cards are competitor-shaped.** Could appear unchanged on SecretSecretary or dogshow.com. No scent sport focus, no offline, no ringside, no exhibitor side.

6. **Pricing section appears too early in scroll.** Before features and credibility are established.

7. **Pricing structure doesn't reflect actual revenue model.** Shows Free/$4.99 Premium with no mention of convenience fees, no club tier, no recognition that primary revenue is per-entry convenience fees.

8. **$4.99/month exhibitor premium feels too low.** Serious dog sport exhibitors spend thousands/year — $4.99 implies low value. Probably $9.99-$14.99 is the sweet spot.

9. **No waitlist signup anywhere.** Visitor who's interested has only Sign Up (implies launched product) or leave.

10. **No credibility anchors.** Nothing surfaces the 13 years, AKC/UKC relationships, customer base on mySWT/myNWT/mySCT, or any social proof.

11. **No real product screenshots.** Only image is the cyborg dog.

12. **Sign In / Sign Up buttons imply launched product.** Inconsistent with reality (not shipped). Creates positioning ambiguity.

13. **FAQ missing critical questions.** No "does this work offline at venues?", no "which sanctioning bodies?", no "I'm a current mySWT customer — what now?", no "how is this different from SecretSecretary?"

## Recommended hero copy (replacement)

**Headline:** "Dog show management built for scent sports."

**Subhead:** "Online entries, ringside scoring, and exhibitor tracking — from the team behind mySWT, myNWT, and myK9Q."

**Primary CTA:** "Join the Waitlist"

**Secondary CTA:** "See How It Works" (scrolls down)

Notice all Tier 1 / Tier 2 language — architecture facts and team credibility, no dates, no feature commitments.

## Recommended replacement feature cards (six cards, two rows, three each)

**For clubs:**
1. **Offline-first ringside** — set up online, run trial day offline, sync when signal returns
2. **Scent sports specialization** — AKC Scent Work, UKC Nosework, ASCA Scent Detection with rules built in
3. **One system from entry to ribbon** — premium list → entries → catalog → scoring → results → titles

**For exhibitors:**
4. **Your dog's career, in one place** — titles, training, health, history
5. **Statistics that mean something** — qualifying rates, time-under-par trends, performance insights
6. **From the team you already trust** — building AKC/UKC/ASCA scent sport software since 2013

## Recommended pricing restructure

Three tiers reflecting actual customer types:

- **For Clubs — Free.** Full club platform. Per-entry convenience fee (~$1.50, capped at $10/exhibitor) paid by exhibitor at checkout.
- **For Exhibitors — Free tier.** Browse shows, log results, basic dog profiles.
- **For Exhibitors — Premium ~$9.99-$14.99/month.** Title tracking, training journal, health records, statistics, priority support.

OR: remove pricing entirely from landing page, link to `/pricing` page.

## Recommended FAQ additions

- "Does this work without internet at trial venues?" — answer: yes, local-first PWA, sync when signal returns
- "Which sanctioning bodies does this support?" — answer: AKC Scent Work, UKC Nosework, ASCA Scent Detection at launch; others to follow
- "What's the convenience fee on entries?" — answer: ~$1.50 per entry, capped at $10 per exhibitor per show (validate this number first)
- "When will obedience / agility / conformation / FastCat be added?" — Tier 2 answer: 2027 timeframe, sign up for waitlist for updates
- "How is myK9Show different from SecretSecretary or dogshow.com?" — own the differentiation directly
- "I'm a current mySWT / myNWT / mySCT customer — what happens to my Access app?" — address migration concerns

## Positioning decision required: pre-launch vs. soft-launch

The page is currently trying to be both. Decide:

- **Pre-launch:** Replace Sign Up with Join Waitlist, remove search bar, defer pricing, build anticipation
- **Soft-launch:** Keep Sign Up but be explicit about what's available today vs. coming

Recommended: pre-launch. Aligns with under-promise/over-deliver philosophy and the Tier 1/Tier 2 communication framework.

## Implementation priority (3-week plan, ~2-4 hours per week)

**Week 1 (highest ROI):**
- Replace hero copy and image
- Add waitlist form (Fluent CRM embed)
- Move/remove pricing section
- Update meta description and OG image for social sharing

**Week 2:**
- Rewrite six feature cards
- Update FAQ
- Add "Built by RyKris since 2013" credibility line

**Week 3 (when energy allows):**
- Replace cyborg dog with real photography
- Add real product screenshots when shippable
- Test pricing structure with actual exhibitor/club inputs

## Meta tag fixes (one-line changes, big impact)

Current meta description: "A comprehensive solution for managing dog shows, events, registrations, and scoring—all in one place."

Suggested: "Dog show management built for AKC, UKC, and ASCA scent sports. Local-first software that works offline at trial venues. From the team behind mySWT, myNWT, and myK9Q."

Current Twitter card: `summary` (small image)
Suggested: `summary_large_image` (full hero preview)

Current OG image: PWA app icon
Suggested: branded product hero image or screenshot
