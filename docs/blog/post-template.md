# Blog Post Template

Use this structure for every customer education post. Fill in the frontmatter, then write the body. Remove placeholder lines before publishing.

---

```markdown
---
title: "Title in sentence case — state the benefit or answer, not the topic"
audience: secretary | exhibitor | club | treasurer | judge | all
category: secretary-tips | exhibitor-tips | club-operations | payments-explained | show-day-reliability | release-notes
customer_question: "The verbatim question this post answers, as a customer would say it"
related_guide: docs/user-guides/<guide>.md  # section that covers this topic in depth
related_kb:
  - <article-slug>         # KB article this post supplements
  - <article-slug>
last_verified: YYYY-MM-DD  # date the described workflow was confirmed in the live app
status: draft | draft-ready | published
---
```

---

## [Post Title]

**One sentence:** what this post covers and who it is for.

*Example: If you've ever wondered why your entry says "Pending" after you pay, this post walks through exactly what happens — and when it changes.*

---

### [Lead section — answer the question first]

State the main answer or takeaway in the first paragraph. A reader who stops here should still have the most important piece of information.

---

### [Context / why this matters]

One short section of background — only if it makes the main explanation land better. Skip if the answer is self-evident. Do not use this section to tell people how great the platform is.

---

### [Steps or explanation]

Use numbered steps for anything the reader will do. Use short prose for anything they are just learning. Do not duplicate a full guide section here — summarize and link instead.

If the workflow has multiple phases, use a simple timeline:

1. **You enter and pay** — entry goes to Pending.
2. **Secretary reviews** — entry moves to Accepted or Waitlisted.
3. **Show window closes** — no more entries accepted.
4. **Show day** — run order and check-in open.

---

### [Common questions or "what if..."]

One or two short Q&A pairs for the most predictable follow-up questions. Keep answers to two sentences max. If the answer is long, link to the KB article instead.

**What if my entry still says Pending after a week?**
Check that the entry window is still open. If it is, the secretary hasn't reviewed it yet — that's normal. If the window has closed, [contact support](#).

---

### Related

- [Guide section title](../user-guides/<guide>.md) — deeper steps for this workflow
- [KB: article-slug](#) — quick reference for the most common related question
- [Support contact](#) — if none of this solved it

---

## Writing Checklist (remove before publishing)

- [ ] Frontmatter complete: title, audience, category, customer_question, related_guide, related_kb, last_verified, status
- [ ] Main answer appears in the first paragraph
- [ ] No step duplicates a full guide section (summarize and link)
- [ ] No software jargon, route names, store names, or feature-flag names
- [ ] Tone: educational, reassuring, practical — not salesy
- [ ] Dog-show terminology used where it applies (trial, class, run order, armband)
- [ ] Every "related" link is a real, working path
- [ ] last_verified is within the last 30 days (or the guide section it references has been verified)
- [ ] Screenshots or diagrams use the seeded fixture accounts only (no real customer data)
